import YahooFinance from "yahoo-finance2";
import type {
  MarketDataFailure,
  MarketDataFailureReason,
  MarketListing,
  MarketListingCandidate,
  MarketQuote,
  MarketQuoteBatchResult,
  MarketQuoteOutcome,
  MarketSearchResult,
  MarketSession,
} from "../../types";

// This module has no browser consumers. Fail closed if it is accidentally imported by an island.
if (typeof window !== "undefined") throw new Error("Market data requires the server runtime");

export const YAHOO_REQUEST_BUDGET_MS = 5_000;
export const YAHOO_BATCH_SIZE = 50;
const SYMBOL = /^[A-Z0-9][A-Z0-9.^=-]{0,49}$/;
const SESSIONS = new Set<MarketSession>(["REGULAR", "CLOSED", "PRE", "PREPRE", "POST", "POSTPOST"]);

interface YahooTransport {
  search(query: string, signal: AbortSignal): Promise<unknown>;
  quote(symbols: string[], signal: AbortSignal): Promise<unknown>;
}

interface RequestOptions {
  signal?: AbortSignal;
}

interface AdapterOptions {
  transport?: YahooTransport;
  /** Probe the actual SDK's abort propagation without contacting Yahoo. */
  fetch?: typeof fetch;
  now?: () => Date;
  /** Tests/probes may shorten the deadline, but cannot extend the production budget. */
  timeoutMs?: number;
}

class RequestFailure extends Error {
  readonly reason: MarketDataFailureReason;

  constructor(reason: MarketDataFailureReason) {
    super("Market data request did not complete");
    this.reason = reason;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

function symbol(value: unknown): string | null {
  const clean = text(value, 50)?.toUpperCase();
  return clean && SYMBOL.test(clean) ? clean : null;
}

function failure(reason: MarketDataFailureReason): MarketDataFailure {
  return { ok: false, reason };
}

function providerFailure(error: unknown): MarketDataFailure {
  if (error instanceof RequestFailure) return failure(error.reason);
  const status = record(error)?.code;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
    ? { ok: false, reason: "provider_unavailable", status }
    : failure("provider_unavailable");
}

function createTransport(fetchOverride?: typeof fetch): YahooTransport {
  // SDK diagnostics can contain complete provider responses. Application services report the safe outcome instead.
  const discard = () => undefined;
  const client = new YahooFinance({
    queue: { concurrency: 1 },
    logger: { info: discard, warn: discard, error: discard, debug: discard, dir: discard },
    suppressNotices: ["yahooSurvey", "ripHistorical"],
    versionCheck: false,
    ...(fetchOverride ? { fetch: fetchOverride } : {}),
  });
  return {
    search: (query, signal) =>
      client.search(
        query,
        { quotesCount: 10, newsCount: 0, enableCb: false, enableNavLinks: false },
        { fetchOptions: { signal } },
      ),
    quote: (symbols, signal) => client.quote(symbols, { return: "object" }, { fetchOptions: { signal } }),
  };
}

/** Deadline covers SDK cookie/crumb setup and queue waits as well as the quote request. */
async function bounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (parentSignal?.aborted) throw new RequestFailure("cancelled");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      controller.abort();
      reject(new RequestFailure("cancelled"));
    };
    parentSignal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestFailure("timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), stopped]);
  } finally {
    clearTimeout(timer);
    if (cancel) parentSignal?.removeEventListener("abort", cancel);
  }
}

/** Quantize the SDK number's decimal representation; upstream JSON precision cannot be recovered here. */
function priceText(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 1_000_000_000_000) return null;
  const parts = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if (!parts) return null;
  const fraction = parts.at(2) ?? "";
  const digits = BigInt(parts[1] + fraction);
  const shift = 8 - fraction.length + Number(parts.at(3) ?? 0);
  let units: bigint;
  if (shift >= 0) units = digits * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    units = digits / divisor + ((digits % divisor) * 2n >= divisor ? 1n : 0n);
  }
  if (units <= 0n || units >= 100_000_000_000_000_000_000n) return null;
  const whole = units / 100_000_000n;
  const decimal = (units % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : whole.toString();
}

function minutes(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function candidate(raw: unknown, search: boolean): MarketListingCandidate | null {
  const row = record(raw);
  if (!row || (search && row.isYahooFinance !== true)) return null;
  const id = symbol(row.symbol);
  const name = text(search ? (row.longname ?? row.shortname) : (row.longName ?? row.shortName));
  const exchange = text(row.exchange, 20);
  if (!id || !name || !exchange || !/^[A-Z0-9]+$/.test(exchange)) return null;
  if (row.quoteType !== "EQUITY" && row.quoteType !== "ETF") return null;
  return {
    symbol: id,
    name,
    exchange,
    exchangeName: text(search ? row.exchDisp : row.fullExchangeName) ?? exchange,
    instrumentType: row.quoteType,
  };
}

function normalize(
  raw: unknown,
  requestedSymbol: string,
  fetchedAt: Date,
  expected?: MarketListing,
): MarketQuoteOutcome {
  const row = record(raw);
  const listing = candidate(raw, false);
  if (!row || listing?.symbol !== requestedSymbol) return failure("invalid_quote");
  const price = priceText(row.regularMarketPrice);
  const timezone = text(row.exchangeTimezoneName, 100);
  const marketAt = row.regularMarketTime;
  const currency = row.currency;
  if (
    !price ||
    !timezone ||
    (currency !== "USD" && currency !== "PLN") ||
    !(marketAt instanceof Date) ||
    !Number.isFinite(marketAt.getTime()) ||
    marketAt.getTime() <= 0 ||
    marketAt.getTime() > fetchedAt.getTime() ||
    !SESSIONS.has(row.marketState as MarketSession)
  ) {
    return failure("invalid_quote");
  }
  if (
    expected &&
    (expected.symbol !== listing.symbol ||
      expected.exchange !== listing.exchange ||
      expected.currency !== currency ||
      expected.timezone !== timezone ||
      expected.instrumentType !== listing.instrumentType)
  ) {
    return failure("invalid_quote");
  }
  let marketDate: string;
  try {
    marketDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(marketAt);
  } catch {
    return failure("invalid_quote");
  }
  const quote: MarketQuote = {
    provider: "yahoo",
    listing: { ...listing, currency, timezone },
    price,
    marketAt: marketAt.toISOString(),
    marketDate,
    fetchedAt: fetchedAt.toISOString(),
    marketState: row.marketState as MarketSession,
    sourceIntervalMinutes: minutes(row.sourceInterval),
    delayMinutes: minutes(row.exchangeDataDelayedBy),
    sourceName: text(row.quoteSourceName),
  };
  return { ok: true, quote };
}

/** Server-only SDK boundary. No persistence, user data, valuation selection or automatic retry lives here. */
export function createYahooMarketData(options: AdapterOptions = {}) {
  const transport = options.transport ?? createTransport(options.fetch);
  const now = options.now ?? (() => new Date());
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? YAHOO_REQUEST_BUDGET_MS, YAHOO_REQUEST_BUDGET_MS));

  async function searchListings(query: string, request: RequestOptions = {}): Promise<MarketSearchResult> {
    const clean = text(query, 100);
    if (!clean || clean.length < 2) return failure("invalid_request");
    try {
      const raw = record(await bounded((signal) => transport.search(clean, signal), timeoutMs, request.signal));
      if (!raw || !Array.isArray(raw.quotes)) return failure("provider_unavailable");
      const seen = new Set<string>();
      const listings: MarketListingCandidate[] = [];
      for (const row of raw.quotes as unknown[]) {
        const item = candidate(row, true);
        if (item && !seen.has(item.symbol)) {
          listings.push(item);
          seen.add(item.symbol);
        }
        if (listings.length === 10) break;
      }
      return { ok: true, listings };
    } catch (error) {
      return providerFailure(error);
    }
  }

  async function confirmListing(input: string, request: RequestOptions = {}): Promise<MarketQuoteOutcome> {
    const id = symbol(input);
    if (!id) return failure("invalid_request");
    try {
      const raw = record(await bounded((signal) => transport.quote([id], signal), timeoutMs, request.signal));
      if (!raw) return failure("provider_unavailable");
      if (!Object.hasOwn(raw, id)) return failure("not_found");
      return normalize(raw[id], id, now());
    } catch (error) {
      return providerFailure(error);
    }
  }

  async function fetchQuotes(
    listings: readonly MarketListing[],
    request: RequestOptions = {},
  ): Promise<MarketQuoteBatchResult> {
    if (listings.length === 0) return { ok: true, quotes: {} };
    if (listings.length > YAHOO_BATCH_SIZE || listings.some((item) => symbol(item.symbol) !== item.symbol)) {
      return failure("invalid_request");
    }
    const expected = new Map(listings.map((item) => [item.symbol, item]));
    if (
      listings.some((item) => {
        const other = expected.get(item.symbol);
        return (
          other &&
          (other.exchange !== item.exchange ||
            other.currency !== item.currency ||
            other.timezone !== item.timezone ||
            other.instrumentType !== item.instrumentType)
        );
      })
    ) {
      return failure("invalid_request");
    }
    try {
      const raw = record(
        await bounded((signal) => transport.quote([...expected.keys()], signal), timeoutMs, request.signal),
      );
      if (!raw) return failure("provider_unavailable");
      const fetchedAt = now();
      const quotes: Record<string, MarketQuoteOutcome> = {};
      for (const [id, listing] of expected) {
        quotes[id] = Object.hasOwn(raw, id) ? normalize(raw[id], id, fetchedAt, listing) : failure("not_found");
      }
      return { ok: true, quotes };
    } catch (error) {
      return providerFailure(error);
    }
  }

  return { searchListings, confirmListing, fetchQuotes };
}
