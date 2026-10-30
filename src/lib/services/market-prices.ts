import type { createClient } from "@/lib/supabase";
import { createYahooMarketData } from "@/lib/market-data/yahoo";
import { providerBudget, quoteBatches } from "@/lib/market-data/refresh-policy";
import { reportUnexpected } from "@/lib/observability/reporter";
import { createPriceRepository, type PriceCache, type PriceRepository } from "./market-price-repository";
import type {
  MarketDataFailure,
  MarketListing,
  MarketListingLookupResult,
  MarketPriceDownloadItem,
  MarketPriceServiceFailure,
  MarketQuote,
  MarketQuoteOutcome,
} from "@/types";
export type MarketDataProvider = ReturnType<typeof createYahooMarketData>;
interface ServiceOptions {
  provider?: MarketDataProvider;
  repository?: PriceRepository;
  now?: () => number;
  budgetMs?: number;
}
function identity(row: MarketListing): MarketListing {
  return {
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    exchangeName: row.exchangeName,
    currency: row.currency,
    timezone: row.timezone,
    instrumentType: row.instrumentType,
  };
}
function cachedQuote(row: PriceCache): MarketQuote | null {
  if (!row.price || !row.marketAt || !row.marketDate || !row.fetchedAt || !row.marketState) return null;
  return {
    provider: "yahoo",
    listing: identity(row),
    price: row.price,
    marketAt: row.marketAt,
    marketDate: row.marketDate,
    fetchedAt: row.fetchedAt,
    marketState: row.marketState,
    sourceIntervalMinutes: row.sourceIntervalMinutes,
    delayMinutes: row.delayMinutes,
    sourceName: row.sourceName,
  };
}
function quoteFailure(result: MarketDataFailure): MarketDataFailure {
  return result.reason === "invalid_request" ? { ok: false, reason: "invalid_quote" } : result;
}
function report(result: MarketDataFailure) {
  // Never pass provider errors, URLs or response payloads to logging/Sentry.
  if (result.reason === "cancelled") return;
  reportUnexpected(Object.assign(new Error("Market data operation failed"), { status: result.status }), {
    operation: "marketPrices",
  });
}
/** Provider calls exist only in explicit search/download methods, never in read composition. */
export function createMarketPriceService(
  client: ReturnType<typeof createClient>,
  userId: string,
  options: ServiceOptions = {},
) {
  const repository = options.repository ?? createPriceRepository(client, userId);
  const now = options.now ?? Date.now;
  let provider = options.provider;
  const api = () => (provider ??= createYahooMarketData());
  function blocked(row: { cooldownUntil: string | null; leaseUntil: string | null } | null): {
    reason: "cooldown" | "refreshing";
    retryAfter: string | null;
  } {
    if (row?.cooldownUntil && Date.parse(row.cooldownUntil) > now())
      return { reason: "cooldown", retryAfter: row.cooldownUntil };
    return { reason: "refreshing", retryAfter: row?.leaseUntil ?? null };
  }
  async function search(positionId: string, query: string, signal?: AbortSignal) {
    if (!(await repository.position(positionId))) return { ok: false as const, reason: "not_found" as const };
    const result = await api().searchListings(query, { signal });
    if (!result.ok) report(result);
    return result;
  }
  async function download(
    positionIds?: string[],
    signal?: AbortSignal,
  ): Promise<{ ok: true; results: MarketPriceDownloadItem[] } | MarketPriceServiceFailure> {
    const listings = await repository.downloadListings(positionIds);
    if (listings === null) return { ok: false, reason: "not_found" };
    const unique = [...new Map(listings.map((row) => [row.id, row])).values()];
    const results: MarketPriceDownloadItem[] = [];
    const budget = providerBudget(signal, options.budgetMs);
    try {
      for (const batch of quoteBatches(unique)) {
        const claimed: { row: PriceCache; token: string }[] = [];
        for (const row of batch) {
          if (budget.stopped) {
            results.push({ listingId: row.id, symbol: row.symbol, outcome: "due", retryAfter: null });
            continue;
          }
          const token = await repository.claim(row.id);
          if (token) claimed.push({ row, token });
          else {
            const state = blocked(await repository.cache(row.id));
            results.push({
              listingId: row.id,
              symbol: row.symbol,
              outcome: state.reason,
              retryAfter: state.retryAfter,
            });
          }
        }
        if (budget.stopped) {
          for (const { row, token } of claimed) {
            await repository.release(row.id, token);
            results.push({ listingId: row.id, symbol: row.symbol, outcome: "due", retryAfter: null });
          }
          continue;
        }
        if (!claimed.length) continue;
        const response = await budget.run((operationSignal) =>
          api().fetchQuotes(
            claimed.map(({ row }) => identity(row)),
            { signal: operationSignal },
          ),
        );
        const outcome = response.ok ? response.value : response;
        if (!outcome.ok) report(outcome);
        for (const { row, token } of claimed) {
          const member: MarketQuoteOutcome = outcome.ok
            ? (outcome.quotes[row.symbol] ?? { ok: false, reason: "not_found" })
            : quoteFailure(outcome);
          if (!member.ok && outcome.ok) report(member);
          const accepted = await repository.finish(row.id, token, member);
          const persisted = !member.ok || !accepted ? await repository.cache(row.id) : null;
          results.push({
            listingId: row.id,
            symbol: row.symbol,
            outcome: member.ok ? (accepted ? "success" : "older_quote") : member.reason,
            retryAfter: persisted?.cooldownUntil ?? null,
          });
        }
      }
      return { ok: true, results };
    } finally {
      budget.dispose();
    }
  }
  async function lookup(positionId: string, symbol: string, signal?: AbortSignal): Promise<MarketListingLookupResult> {
    const position = await repository.position(positionId);
    if (!position) return { ok: false, reason: "not_found" };
    if (!position.currency) return { ok: false, reason: "currency_required" };
    const receipt = await repository.receipt(positionId, symbol);
    const token = await repository.claimLookup(receipt.id);
    if (!token) return { ok: false, ...blocked(await repository.readReceipt(positionId, receipt.id)) };
    const budget = providerBudget(signal, options.budgetMs);
    let cached: PriceCache | null = null;
    let cacheToken: string | null = null;
    try {
      cached = await repository.candidate(symbol, position.currency);
      if (cached) {
        cacheToken = await repository.claim(cached.id);
        if (!cacheToken) {
          await repository.finishLookup(receipt.id, token, undefined, undefined, true);
          return { ok: false, ...blocked(await repository.cache(cached.id)) };
        }
      }
      if (budget.stopped) {
        if (cached && cacheToken) await repository.release(cached.id, cacheToken);
        await repository.finishLookup(receipt.id, token, undefined, undefined, true);
        return { ok: false, reason: signal?.aborted ? "cancelled" : "timeout" };
      }
      const response = await budget.run(async (operationSignal): Promise<MarketQuoteOutcome> => {
        if (!cached) return api().confirmListing(symbol, { signal: operationSignal });
        const batch = await api().fetchQuotes([identity(cached)], { signal: operationSignal });
        return batch.ok ? (batch.quotes[symbol] ?? { ok: false, reason: "not_found" }) : batch;
      });
      let outcome = response.ok ? response.value : response;
      if (outcome.ok && outcome.quote.listing.currency !== position.currency) {
        await repository.finishLookup(receipt.id, token);
        return { ok: false, reason: "incompatible_currency" };
      }
      if (!outcome.ok) {
        outcome = quoteFailure(outcome);
        report(outcome);
        if (cached && cacheToken) await repository.finish(cached.id, cacheToken, outcome);
        await repository.finishLookup(receipt.id, token, undefined, outcome.retryAfter);
        const state = await repository.readReceipt(positionId, receipt.id);
        return { ...outcome, ...(state?.cooldownUntil ? { retryAfter: state.cooldownUntil } : {}) };
      }
      cached ??= await repository.ensureCache(outcome.quote);
      cacheToken ??= await repository.claim(cached.id);
      if (!cacheToken) {
        await repository.finishLookup(receipt.id, token, undefined, undefined, true);
        return { ok: false, ...blocked(await repository.cache(cached.id)) };
      }
      await repository.finish(cached.id, cacheToken, outcome);
      if (!(await repository.finishLookup(receipt.id, token, cached.id)))
        return { ok: false, reason: "lookup_expired" };
      const saved = await repository.cache(cached.id);
      const quote = saved ? cachedQuote(saved) : null;
      if (!quote) return { ok: false, reason: "lookup_expired" };
      return { ok: true, lookupId: receipt.id, listing: quote.listing, quote };
    } finally {
      budget.dispose();
    }
  }
  async function confirm(positionId: string, receiptId: string): Promise<{ ok: true } | MarketPriceServiceFailure> {
    const position = await repository.position(positionId);
    if (!position) return { ok: false, reason: "not_found" };
    if (!position.currency) return { ok: false, reason: "currency_required" };
    const receipt = await repository.readReceipt(positionId, receiptId);
    if (!receipt) return { ok: false, reason: "not_found" };
    if (!receipt.cacheId || !receipt.validUntil || Date.parse(receipt.validUntil) <= now())
      return { ok: false, reason: "lookup_expired" };
    const cached = await repository.cache(receipt.cacheId);
    if (cached?.currency !== position.currency) return { ok: false, reason: "incompatible_currency" };
    const confirmed = await repository.confirm(positionId, receiptId);
    if (confirmed === "incompatible_currency") return { ok: false, reason: "incompatible_currency" };
    return confirmed ? { ok: true } : { ok: false, reason: "lookup_expired" };
  }
  return { search, download, lookup, confirm };
}
