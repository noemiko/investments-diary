import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketListing } from "@/types";
import { createYahooMarketData, YAHOO_REQUEST_BUDGET_MS } from "./yahoo";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function listing(id = "AAPL"): MarketListing {
  const polish = id.endsWith(".WA");
  return {
    symbol: id,
    name: polish ? "PKO Bank Polski" : "Apple Inc.",
    exchange: polish ? "WSE" : "NMS",
    exchangeName: polish ? "Warsaw" : "NasdaqGS",
    instrumentType: "EQUITY",
    currency: polish ? "PLN" : "USD",
    timezone: polish ? "Europe/Warsaw" : "America/New_York",
  };
}

function quote(id = "AAPL", overrides: Record<string, unknown> = {}) {
  const identity = listing(id);
  return {
    symbol: id,
    shortName: identity.name,
    exchange: identity.exchange,
    fullExchangeName: identity.exchangeName,
    quoteType: identity.instrumentType,
    currency: identity.currency,
    exchangeTimezoneName: identity.timezone,
    regularMarketPrice: 123.456789125,
    regularMarketTime: new Date("2026-10-30T11:40:00.000Z"),
    marketState: "REGULAR",
    sourceInterval: 15,
    exchangeDataDelayedBy: 15,
    quoteSourceName: "Delayed Quote",
    ...overrides,
  };
}

function adapter(quoteResult: unknown = { AAPL: quote() }, searchResult: unknown = { quotes: [] }) {
  const transport = {
    quote: vi.fn((_symbols: string[], _signal: AbortSignal) => Promise.resolve(quoteResult)),
    search: vi.fn((_query: string, _signal: AbortSignal) => Promise.resolve(searchResult)),
  };
  return { api: createYahooMarketData({ transport, now: () => NOW }), transport };
}

afterEach(() => vi.useRealTimers());

describe("Yahoo listing and quote boundary", () => {
  it("confirms a complete regular-session quote and preserves market time independently of fetch time", async () => {
    const { api } = adapter();
    await expect(api.confirmListing(" aapl ")).resolves.toEqual({
      ok: true,
      quote: {
        provider: "yahoo",
        listing: listing(),
        price: "123.45678913",
        marketAt: "2026-10-30T11:40:00.000Z",
        marketDate: "2026-10-30",
        fetchedAt: NOW.toISOString(),
        marketState: "REGULAR",
        sourceIntervalMinutes: 15,
        delayMinutes: 15,
        sourceName: "Delayed Quote",
      },
    });
  });

  it("uses exchange calendar date and regular-session price even when extended prices exist", async () => {
    const { api } = adapter({
      AAPL: quote("AAPL", {
        regularMarketTime: new Date("2026-10-30T00:30:00Z"),
        regularMarketPrice: 50,
        postMarketPrice: 999,
        postMarketTime: new Date("2026-10-30T01:30:00Z"),
        marketState: "POST",
      }),
    });
    const result = await api.confirmListing("AAPL");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.price).toBe("50");
      expect(result.quote.marketDate).toBe("2026-10-29");
      expect(result.quote.marketAt).toBe("2026-10-30T00:30:00.000Z");
      expect(result.quote.marketState).toBe("POST");
    }
  });

  it("accepts a closed Warsaw quote and optional delay metadata without inventing freshness", async () => {
    const { api } = adapter({
      "PKO.WA": quote("PKO.WA", {
        marketState: "CLOSED",
        regularMarketTime: new Date("2026-10-29T16:00:00Z"),
        exchangeDataDelayedBy: undefined,
        sourceInterval: undefined,
        quoteSourceName: undefined,
      }),
    });
    const result = await api.confirmListing("PKO.WA");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.listing.currency).toBe("PLN");
      expect(result.quote.delayMinutes).toBeNull();
      expect(result.quote.sourceIntervalMinutes).toBeNull();
      expect(result.quote.sourceName).toBeNull();
      expect(result.quote.marketAt).toBe("2026-10-29T16:00:00.000Z");
    }
  });

  it.each([
    { regularMarketPrice: undefined },
    { regularMarketPrice: "50" },
    { regularMarketPrice: Number.NaN },
    { regularMarketPrice: Number.POSITIVE_INFINITY },
    { regularMarketPrice: 0 },
    { regularMarketPrice: -1 },
    { regularMarketPrice: 1_000_000_000_000 },
    { regularMarketPrice: 0.0000000049 },
    { currency: undefined },
    { currency: "EUR" },
    { exchange: undefined },
    { exchangeTimezoneName: "not/a-timezone" },
    { regularMarketTime: undefined },
    { regularMarketTime: "2026-10-30T11:40:00Z" },
    { regularMarketTime: new Date("invalid") },
    { regularMarketTime: new Date("2026-10-31T11:40:00Z") },
    { symbol: "MSFT" },
    { quoteType: "NONE" },
    { marketState: "UNKNOWN" },
  ])("rejects unusable or mismatched provider data: %j", async (overrides) => {
    const { api } = adapter({ AAPL: quote("AAPL", overrides) });
    await expect(api.confirmListing("AAPL")).resolves.toEqual({ ok: false, reason: "invalid_quote" });
  });

  it.each([
    [1.000000005, "1.00000001"],
    [1.000000004, "1"],
    [5e-9, "0.00000001"],
    [1e-7, "0.0000001"],
    [123.45, "123.45"],
  ])("quantizes SDK number %s to decimal text %s with half-up rounding", async (input, expected) => {
    const { api } = adapter({ AAPL: quote("AAPL", { regularMarketPrice: input }) });
    const result = await api.confirmListing("AAPL");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quote.price).toBe(expected);
  });

  it("matches partial batches by symbol rather than input/response order and deduplicates requests", async () => {
    const { api, transport } = adapter({ "PKO.WA": quote("PKO.WA"), AAPL: quote(), EXTRA: quote("EXTRA") });
    const result = await api.fetchQuotes([listing(), listing("MISSING"), listing("PKO.WA"), listing()]);
    expect(transport.quote.mock.calls[0]?.[0]).toEqual(["AAPL", "MISSING", "PKO.WA"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.quotes)).toEqual(["AAPL", "MISSING", "PKO.WA"]);
      expect(result.quotes.AAPL.ok).toBe(true);
      expect(result.quotes["PKO.WA"].ok).toBe(true);
      expect(result.quotes.MISSING).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it.each([{ currency: "PLN" }, { exchange: "NYQ" }, { exchangeTimezoneName: "Europe/Warsaw" }, { quoteType: "ETF" }])(
    "keeps valid batch members while rejecting confirmed identity changes: %j",
    async (changed) => {
      const { api } = adapter({ AAPL: quote("AAPL", changed), "PKO.WA": quote("PKO.WA") });
      const result = await api.fetchQuotes([listing(), listing("PKO.WA")]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.quotes.AAPL).toEqual({ ok: false, reason: "invalid_quote" });
        expect(result.quotes["PKO.WA"].ok).toBe(true);
      }
    },
  );

  it("searches only supported Yahoo listings, deduplicates and does not pretend search supplies currency", async () => {
    const item = {
      symbol: "AAPL",
      shortname: "Apple Inc.",
      exchange: "NMS",
      exchDisp: "NASDAQ",
      quoteType: "EQUITY",
      isYahooFinance: true,
    };
    const { api, transport } = adapter(
      {},
      {
        quotes: [
          { name: "Unlisted", isYahooFinance: false },
          { ...item, symbol: "BTC-USD", quoteType: "CRYPTOCURRENCY" },
          item,
          item,
          { ...item, symbol: "SPY", quoteType: "ETF" },
        ],
      },
    );
    await expect(api.searchListings("Apple")).resolves.toEqual({
      ok: true,
      listings: [
        { symbol: "AAPL", name: "Apple Inc.", exchange: "NMS", exchangeName: "NASDAQ", instrumentType: "EQUITY" },
        { symbol: "SPY", name: "Apple Inc.", exchange: "NMS", exchangeName: "NASDAQ", instrumentType: "ETF" },
      ],
    });
    expect(transport.search.mock.calls[0]?.[0]).toBe("Apple");
  });

  it("bounds malformed requests before network work and treats an empty batch as no work", async () => {
    const { api, transport } = adapter();
    await expect(api.searchListings("a")).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(api.confirmListing("https://private.example")).resolves.toEqual({
      ok: false,
      reason: "invalid_request",
    });
    await expect(api.fetchQuotes(Array.from({ length: 51 }, () => listing()))).resolves.toEqual({
      ok: false,
      reason: "invalid_request",
    });
    await expect(api.fetchQuotes([])).resolves.toEqual({ ok: true, quotes: {} });
    expect(transport.search).not.toHaveBeenCalled();
    expect(transport.quote).not.toHaveBeenCalled();
  });

  it("rejects conflicting identities for the same symbol rather than selecting the last mapping", async () => {
    const { api, transport } = adapter();
    await expect(api.fetchQuotes([listing(), { ...listing(), currency: "PLN" }])).resolves.toEqual({
      ok: false,
      reason: "invalid_request",
    });
    expect(transport.quote).not.toHaveBeenCalled();
  });

  it("returns safe provider outcomes without response body or credential text", async () => {
    const secret = "provider payload and token must not escape";
    const transport = {
      search: () => Promise.reject(new Error(secret)),
      quote: () => Promise.reject(Object.assign(new Error(secret), { code: 429 })),
    };
    const api = createYahooMarketData({ transport });
    await expect(api.searchListings("Apple")).resolves.toEqual({ ok: false, reason: "provider_unavailable" });
    await expect(api.confirmListing("AAPL")).resolves.toEqual({
      ok: false,
      reason: "provider_unavailable",
      status: 429,
    });
  });

  it("bounds the whole operation even if a transport ignores abort and supplies a fresh signal later", async () => {
    vi.useFakeTimers();
    let observed: AbortSignal | undefined;
    const transport = {
      search: () => Promise.resolve({ quotes: [] }),
      quote: (_symbols: string[], signal: AbortSignal) => {
        observed = signal;
        return new Promise<unknown>(() => undefined);
      },
    };
    const api = createYahooMarketData({ transport });
    const pending = api.confirmListing("AAPL");
    await vi.advanceTimersByTimeAsync(YAHOO_REQUEST_BUDGET_MS);
    await expect(pending).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(observed?.aborted).toBe(true);
    const first = observed;
    const next = api.confirmListing("AAPL");
    await vi.advanceTimersByTimeAsync(1);
    expect(observed).not.toBe(first);
    expect(observed?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(YAHOO_REQUEST_BUDGET_MS);
    await next;
  });

  it("honors a caller deadline and refuses already cancelled work", async () => {
    const controller = new AbortController();
    const { api, transport } = adapter();
    controller.abort();
    await expect(api.confirmListing("AAPL", { signal: controller.signal })).resolves.toEqual({
      ok: false,
      reason: "cancelled",
    });
    expect(transport.quote).not.toHaveBeenCalled();
  });

  it("forwards cancellation into the installed SDK's cookie/crumb fetch", async () => {
    vi.useFakeTimers();
    let started = false;
    let aborted = false;
    const api = createYahooMarketData({
      timeoutMs: 100,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          started = true;
          const signal = init?.signal;
          const onAbort = () => {
            aborted = true;
            reject(new Error("Controlled SDK transport cancellation"));
          };
          if (signal?.aborted) onAbort();
          else signal?.addEventListener("abort", onAbort, { once: true });
        }),
    });
    const pending = api.confirmListing("AAPL");
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(started).toBe(true);
    expect(aborted).toBe(true);
  });
});
