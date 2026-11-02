import { afterEach, describe, expect, it, vi } from "vitest";
import type { createClient } from "@/lib/supabase";
import type { MarketQuote, MarketQuoteOutcome } from "@/types";
import { createMarketPriceService, type MarketDataProvider } from "./market-prices";
import type { LookupReceipt, PriceCache, PriceRepository } from "./market-price-repository";
import type { PendingTarget, TargetRepository } from "./market-target-repository";
import { reportUnexpected } from "@/lib/observability/reporter";
vi.mock("@/lib/observability/reporter", () => ({
  reportUnexpected: vi.fn(),
  serviceError: (where: string, error: unknown) => new Error(where, { cause: error }),
}));
const NOW = new Date("2026-10-30T12:00:00Z").getTime();
const client = {} as ReturnType<typeof createClient>;
function listing(n = 0): PriceCache {
  return {
    id: `cache-${n}`,
    symbol: `STOCK${n}`,
    name: `Stock ${n}`,
    exchange: "NMS",
    exchangeName: "Nasdaq",
    currency: "USD",
    timezone: "UTC",
    instrumentType: "EQUITY",
    price: "10",
    marketAt: "2026-10-29T12:00:00Z",
    marketDate: "2026-10-29",
    fetchedAt: "2026-10-30T11:59:59Z",
    marketState: "CLOSED",
    delayMinutes: 15,
    sourceIntervalMinutes: 15,
    sourceName: null,
    cooldownUntil: null,
    leaseUntil: null,
  };
}
function quote(row = listing()): MarketQuote {
  return {
    provider: "yahoo",
    listing: {
      symbol: row.symbol,
      name: row.name,
      exchange: row.exchange,
      exchangeName: row.exchangeName,
      currency: row.currency,
      timezone: row.timezone,
      instrumentType: row.instrumentType,
    },
    price: "12.12345678",
    marketAt: "2026-10-30T11:45:00Z",
    marketDate: "2026-10-30",
    fetchedAt: "2026-10-30T12:00:00Z",
    marketState: "REGULAR",
    delayMinutes: 15,
    sourceIntervalMinutes: 15,
    sourceName: null,
  };
}
function fixture(rows = [listing()], targetRows: PendingTarget[] = []) {
  const caches = new Map(rows.map((r) => [r.id, { ...r }]));
  let receipt: LookupReceipt = {
    id: "receipt",
    cacheId: null,
    validUntil: null,
    cooldownUntil: null,
    leaseUntil: null,
  };
  const repository: PriceRepository = {
    downloadListings: vi.fn<PriceRepository["downloadListings"]>(() => Promise.resolve(rows)),
    position: vi.fn<PriceRepository["position"]>(() => Promise.resolve({ currency: "USD" as const })),
    cache: vi.fn<PriceRepository["cache"]>((id) => Promise.resolve(caches.get(id) ?? null)),
    candidate: vi.fn<PriceRepository["candidate"]>(() => Promise.resolve(null)),
    ensureCache: vi.fn<PriceRepository["ensureCache"]>((q) => {
      const row = { ...listing(), ...q.listing, price: null };
      caches.set(row.id, row);
      return Promise.resolve(row);
    }),
    claim: vi.fn<PriceRepository["claim"]>((id) => Promise.resolve(`token-${id}`)),
    release: vi.fn<PriceRepository["release"]>(() => Promise.resolve()),
    finish: vi.fn<PriceRepository["finish"]>((id, _token, result: MarketQuoteOutcome) => {
      const row = caches.get(id);
      if (row && result.ok)
        Object.assign(row, {
          price: result.quote.price,
          marketAt: result.quote.marketAt,
          marketDate: result.quote.marketDate,
          fetchedAt: result.quote.fetchedAt,
          marketState: result.quote.marketState,
        });
      else if (row) row.cooldownUntil = result.ok ? null : (result.retryAfter ?? "2026-10-30T12:15:00Z");
      return Promise.resolve(true);
    }),
    receipt: vi.fn<PriceRepository["receipt"]>(() => Promise.resolve(receipt)),
    readReceipt: vi.fn<PriceRepository["readReceipt"]>(() => Promise.resolve(receipt)),
    claimLookup: vi.fn<PriceRepository["claimLookup"]>(() => Promise.resolve("lookup-token")),
    finishLookup: vi.fn<PriceRepository["finishLookup"]>((_id, _token, cacheId, _retryAfter, release) => {
      if (cacheId) receipt = { ...receipt, cacheId, validUntil: "2026-10-30T12:30:00Z" };
      else if (!release) receipt = { ...receipt, cooldownUntil: "2026-10-30T12:15:00Z" };
      return Promise.resolve(true);
    }),
    confirm: vi.fn<PriceRepository["confirm"]>(() => Promise.resolve(true)),
  };
  const provider: MarketDataProvider = {
    searchListings: vi.fn<MarketDataProvider["searchListings"]>(() => Promise.resolve({ ok: true, listings: [] })),
    confirmListing: vi.fn<MarketDataProvider["confirmListing"]>(() => Promise.resolve({ ok: true, quote: quote() })),
    fetchQuotes: vi.fn<MarketDataProvider["fetchQuotes"]>((listings) =>
      Promise.resolve({
        ok: true,
        quotes: Object.fromEntries(listings.map((l) => [l.symbol, { ok: true, quote: quote({ ...listing(), ...l }) }])),
      }),
    ),
  };
  const targets: TargetRepository = {
    list: vi.fn<TargetRepository["list"]>(() => Promise.resolve(targetRows)),
    read: vi.fn<TargetRepository["read"]>((id) => Promise.resolve(targetRows.find((r) => r.id === id) ?? null)),
    canonical: vi.fn<TargetRepository["canonical"]>((target) => Promise.resolve(target.cacheId)),
    claim: vi.fn<TargetRepository["claim"]>(() => Promise.resolve("target-token")),
    finish: vi.fn<TargetRepository["finish"]>(() => Promise.resolve(0)),
    release: vi.fn<TargetRepository["release"]>(() => Promise.resolve()),
  };
  const service = createMarketPriceService(client, "owner", { repository, provider, targets, now: () => NOW });
  return { service, repository, provider, caches, targets };
}
function pending(n = 0): PendingTarget {
  return { ...listing(n), id: `target-${n}`, cacheId: null };
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("explicit quote download orchestration", () => {
  it("resolves unknown durable selections only on download and reports mixed-wallet currency rejection", async () => {
    const { service, provider, repository, targets } = fixture([], [pending()]);
    vi.mocked(targets.finish).mockResolvedValue(1);
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(await service.download()).toMatchObject({
      ok: true,
      results: [{ symbol: "STOCK0", outcome: "incompatible_currency", incompatibleCount: 1 }],
    });
    expect(provider.confirmListing).toHaveBeenCalledOnce();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
    expect(repository.ensureCache).toHaveBeenCalledWith(quote());
    expect(targets.finish).toHaveBeenCalledWith(
      "target-0",
      "target-token",
      expect.objectContaining({ ok: true }),
      "cache-0",
    );
  });
  it("shares one canonical cache outcome between mapped and pending holdings", async () => {
    const { service, provider, repository, targets } = fixture([listing()], [{ ...pending(), cacheId: "cache-0" }]);
    expect(await service.download()).toMatchObject({
      ok: true,
      results: [
        { listingId: "cache-0", outcome: "success" },
        { listingId: "target-0", outcome: "success" },
      ],
    });
    expect(provider.fetchQuotes).toHaveBeenCalledOnce();
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(repository.claim).toHaveBeenCalledOnce();
    expect(targets.claim).toHaveBeenCalledOnce();
  });
  it("honors target and canonical leases, failing closed on ambiguous identity", async () => {
    const { service, provider, repository, targets } = fixture([], [pending()]);
    vi.mocked(targets.claim).mockResolvedValueOnce(null);
    expect(await service.download()).toMatchObject({ ok: true, results: [{ outcome: "refreshing" }] });
    vi.mocked(targets.canonical).mockResolvedValueOnce(false);
    expect(await service.download()).toMatchObject({ ok: true, results: [{ outcome: "invalid_quote" }] });
    vi.mocked(targets.canonical).mockResolvedValue("cache-0");
    vi.mocked(repository.cache).mockResolvedValue(listing());
    vi.mocked(repository.claim).mockResolvedValue(null);
    expect(await service.download()).toMatchObject({ ok: true, results: [{ outcome: "refreshing" }] });
    expect(targets.release).toHaveBeenCalledWith("target-0", "target-token");
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
  });
  it("rejects a search/quote identity mismatch without inventing verified metadata", async () => {
    const { service, provider, repository, targets } = fixture([], [pending()]);
    vi.mocked(provider.confirmListing).mockResolvedValue({
      ok: true,
      quote: { ...quote(), listing: { ...quote().listing, exchange: "NYQ" } },
    });
    expect(await service.download()).toMatchObject({ ok: true, results: [{ outcome: "invalid_quote" }] });
    expect(repository.ensureCache).not.toHaveBeenCalled();
    expect(targets.finish).toHaveBeenCalledWith("target-0", "target-token", { ok: false, reason: "invalid_quote" });
  });
  it("uses the same bounded deadline for unknown targets and leaves later targets due", async () => {
    vi.useFakeTimers();
    const { service, provider } = fixture([], [pending(0), pending(1)]);
    vi.mocked(provider.confirmListing).mockImplementation(() => new Promise(() => undefined));
    const result = service.download();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toMatchObject({ ok: true, results: [{ outcome: "timeout" }, { outcome: "due" }] });
    expect(provider.confirmListing).toHaveBeenCalledOnce();
  });
  it("deduplicates mapped identities, batches at 50 and allows another click immediately after success", async () => {
    const rows = Array.from({ length: 103 }, (_, i) => listing(i));
    const { service, provider, repository } = fixture([...rows, rows[0]]);
    const result = await service.download();
    expect(result.ok && result.results.length).toBe(103);
    expect(vi.mocked(provider.fetchQuotes).mock.calls.map(([items]) => items.length)).toEqual([50, 50, 3]);
    expect(repository.claim).toHaveBeenCalledTimes(103);
    await service.download();
    expect(provider.fetchQuotes).toHaveBeenCalledTimes(6);
  });
  it("keeps conflicting full identities for one symbol in different requests", async () => {
    const a = listing(),
      b = { ...listing(1), symbol: a.symbol, currency: "EUR" as const };
    const { service, provider } = fixture([a, b]);
    await service.download();
    expect(vi.mocked(provider.fetchQuotes).mock.calls.map(([items]) => items.map((l) => l.currency))).toEqual([
      ["USD"],
      ["EUR"],
    ]);
  });
  it("matches partial responses by symbol, retains good members and retains cached values on failures", async () => {
    const { service, provider, repository, caches } = fixture([listing(0), listing(1), listing(2)]);
    vi.mocked(provider.fetchQuotes).mockResolvedValue({
      ok: true,
      quotes: { STOCK2: { ok: true, quote: quote(listing(2)) }, STOCK0: { ok: false, reason: "invalid_quote" } },
    });
    const result = await service.download();
    expect(result).toMatchObject({
      ok: true,
      results: [
        { symbol: "STOCK0", outcome: "invalid_quote" },
        { symbol: "STOCK1", outcome: "not_found" },
        { symbol: "STOCK2", outcome: "success" },
      ],
    });
    expect(caches.get("cache-0")?.price).toBe("10");
    expect(caches.get("cache-1")?.price).toBe("10");
    expect(caches.get("cache-2")?.price).toBe("12.12345678");
    expect(repository.finish).toHaveBeenCalledTimes(3);
  });
  it("honors atomic claim cooldowns before provider work, without using successful fetch age", async () => {
    const row = { ...listing(), cooldownUntil: "2026-10-30T13:00:00Z" };
    const { service, provider, repository } = fixture([row]);
    vi.mocked(repository.claim).mockResolvedValue(null);
    expect(await service.download()).toMatchObject({
      ok: true,
      results: [{ outcome: "cooldown", retryAfter: row.cooldownUntil }],
    });
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
  });
  it("reports the persisted cooldown when an older quote is rejected and keeps the last valid value", async () => {
    const retained = { ...listing(), cooldownUntil: "2026-10-30T12:15:00Z" };
    const { service, provider, repository, caches } = fixture([retained]);
    vi.mocked(repository.finish).mockResolvedValue(false);
    expect(await service.download()).toMatchObject({
      ok: true,
      results: [{ symbol: "STOCK0", outcome: "older_quote", retryAfter: retained.cooldownUntil }],
    });
    expect(provider.fetchQuotes).toHaveBeenCalledOnce();
    expect(caches.get("cache-0")?.price).toBe("10");
    expect(caches.get("cache-0")?.marketAt).toBe(retained.marketAt);
  });
  it("passes longer provider Retry-After through to persistence", async () => {
    const { service, provider, repository } = fixture();
    const failure = {
      ok: false as const,
      reason: "provider_unavailable" as const,
      status: 429,
      retryAfter: "2026-10-30T14:00:00Z",
    };
    vi.mocked(provider.fetchQuotes).mockResolvedValue(failure);
    expect(await service.download()).toMatchObject({
      ok: true,
      results: [{ outcome: "provider_unavailable", retryAfter: failure.retryAfter }],
    });
    expect(repository.finish).toHaveBeenCalledWith("cache-0", "token-cache-0", failure);
  });
  it("bounds sequential batches by one five-second budget and leaves unattempted symbols due", async () => {
    vi.useFakeTimers();
    const { service, provider, repository } = fixture(Array.from({ length: 103 }, (_, i) => listing(i)));
    let calls = 0;
    let signal: AbortSignal | undefined;
    vi.mocked(provider.fetchQuotes).mockImplementation((rows, request) => {
      calls++;
      signal = request?.signal;
      if (calls === 1)
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve({
              ok: true,
              quotes: Object.fromEntries(
                rows.map((l) => [l.symbol, { ok: true, quote: quote({ ...listing(), ...l }) }]),
              ),
            });
          }, 4_000),
        );
      return new Promise(() => undefined);
    });
    const pending = service.download();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    expect(result.ok && result.results.filter((r) => r.outcome === "success")).toHaveLength(50);
    expect(result.ok && result.results.filter((r) => r.outcome === "timeout")).toHaveLength(50);
    expect(result.ok && result.results.filter((r) => r.outcome === "due")).toHaveLength(3);
    expect(repository.claim).toHaveBeenCalledTimes(100);
    expect(provider.fetchQuotes).toHaveBeenCalledTimes(2);
    expect(signal?.aborted).toBe(true);
  });
  it("releases claimed but unattempted work if the deadline expires during claims", async () => {
    vi.useFakeTimers();
    const { service, repository, provider } = fixture();
    vi.mocked(repository.claim).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve("token");
          }, 5_100);
        }),
    );
    const pending = service.download();
    await vi.advanceTimersByTimeAsync(5_100);
    expect(await pending).toMatchObject({ ok: true, results: [{ outcome: "due" }] });
    expect(repository.release).toHaveBeenCalledWith("cache-0", "token");
    expect(repository.finish).not.toHaveBeenCalled();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
  });
  it("distinguishes caller cancellation and creates a fresh signal for the next click", async () => {
    const { service, provider } = fixture();
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    vi.mocked(provider.fetchQuotes).mockImplementation((_rows, request) => {
      if (request?.signal) signals.push(request.signal);
      return new Promise(() => undefined);
    });
    const first = service.download(undefined, controller.signal);
    await vi.waitFor(() => {
      expect(provider.fetchQuotes).toHaveBeenCalledOnce();
    });
    controller.abort();
    expect(await first).toMatchObject({ ok: true, results: [{ outcome: "cancelled" }] });
    vi.mocked(provider.fetchQuotes).mockImplementation((_rows, request) => {
      if (request?.signal) signals.push(request.signal);
      return Promise.resolve({ ok: true, quotes: {} });
    });
    await service.download();
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(signals[0]).not.toBe(signals[1]);
  });
  it("rejects foreign or ineligible requested positions before any provider work", async () => {
    const { service, provider, repository } = fixture();
    vi.mocked(repository.downloadListings).mockResolvedValue(null);
    expect(await service.download(["foreign"])).toEqual({ ok: false, reason: "not_found" });
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
    expect(repository.claim).not.toHaveBeenCalled();
  });
});
describe("search and validated listing receipts", () => {
  it("searches metadata on explicit submission without quotes or persistence, preserving safe failure", async () => {
    const { service, provider, repository } = fixture();
    vi.mocked(provider.searchListings).mockResolvedValue({ ok: false, reason: "provider_unavailable", status: 503 });
    expect(await service.search("position", "Apple")).toEqual({
      ok: false,
      reason: "provider_unavailable",
      status: 503,
    });
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
    expect(repository.receipt).not.toHaveBeenCalled();
    expect(reportUnexpected).toHaveBeenCalledWith(expect.any(Error), { operation: "marketPrices" });
  });
  it("requires an owned open position before candidate quotes", async () => {
    const { service, provider, repository } = fixture();
    vi.mocked(repository.position).mockResolvedValueOnce(null);
    expect(await service.lookup("foreign", "STOCK0")).toEqual({ ok: false, reason: "not_found" });
    expect(provider.confirmListing).not.toHaveBeenCalled();
  });
  it("persists normalized lookup data and confirms through a position-bound receipt without another quote", async () => {
    const { service, provider, repository } = fixture();
    const result = await service.lookup("position", "STOCK0");
    expect(result).toMatchObject({
      ok: true,
      lookupId: "receipt",
      listing: { symbol: "STOCK0", exchange: "NMS", currency: "USD", timezone: "UTC" },
    });
    expect(repository.receipt).toHaveBeenCalledWith("position", "STOCK0");
    expect(await service.confirm("position", "receipt")).toEqual({ ok: true });
    expect(repository.confirm).toHaveBeenCalledWith("position", "receipt");
    expect(provider.confirmListing).toHaveBeenCalledOnce();
    const lookupRequest = vi.mocked(provider.confirmListing).mock.calls[0];
    expect(lookupRequest[0]).toBe("STOCK0");
    expect(lookupRequest[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
  });
  it("rejects incompatible lookup currency without creating or linking a guessed cache identity", async () => {
    const { service, provider, repository } = fixture();
    vi.mocked(provider.confirmListing).mockResolvedValue({
      ok: true,
      quote: { ...quote(), listing: { ...quote().listing, currency: "PLN" } },
    });
    expect(await service.lookup("position", "STOCK0")).toEqual({ ok: false, reason: "incompatible_currency" });
    expect(repository.ensureCache).not.toHaveBeenCalled();
    expect(repository.confirm).not.toHaveBeenCalled();
  });
  it("honors candidate receipt cooldown before network and known canonical cache cooldown before another lookup", async () => {
    const { service, repository, provider } = fixture();
    vi.mocked(repository.claimLookup).mockResolvedValueOnce(null);
    vi.mocked(repository.readReceipt).mockResolvedValue({
      id: "receipt",
      cacheId: null,
      validUntil: null,
      cooldownUntil: "2026-10-30T13:00:00Z",
      leaseUntil: null,
    });
    expect(await service.lookup("position", "STOCK0")).toMatchObject({ ok: false, reason: "cooldown" });
    vi.mocked(repository.candidate).mockResolvedValue({ ...listing(), cooldownUntil: "2026-10-30T13:00:00Z" });
    vi.mocked(repository.cache).mockResolvedValue({ ...listing(), cooldownUntil: "2026-10-30T13:00:00Z" });
    vi.mocked(repository.claim).mockResolvedValue(null);
    expect(await service.lookup("position", "STOCK0")).toMatchObject({ ok: false, reason: "cooldown" });
    expect(repository.finishLookup).toHaveBeenCalledWith("receipt", "lookup-token", undefined, undefined, true);
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
  });
  it("retains known quote and records both cooldowns on candidate provider failure", async () => {
    const { service, provider, repository, caches } = fixture();
    vi.mocked(repository.candidate).mockResolvedValue(listing());
    vi.mocked(provider.fetchQuotes).mockResolvedValue({ ok: false, reason: "timeout" });
    expect(await service.lookup("position", "STOCK0")).toMatchObject({ ok: false, reason: "timeout" });
    expect(repository.finish).toHaveBeenCalledWith("cache-0", "token-cache-0", { ok: false, reason: "timeout" });
    expect(repository.finishLookup).toHaveBeenCalledWith("receipt", "lookup-token", undefined, undefined);
    expect(caches.get("cache-0")?.price).toBe("10");
  });
  it("rejects expired or substituted receipts and changed wallet denomination without any provider call", async () => {
    const { service, provider, repository } = fixture();
    vi.mocked(repository.readReceipt)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "receipt",
        cacheId: "cache-0",
        validUntil: "2026-10-30T11:59:59Z",
        cooldownUntil: null,
        leaseUntil: null,
      })
      .mockResolvedValue({
        id: "receipt",
        cacheId: "cache-0",
        validUntil: "2026-10-30T13:00:00Z",
        cooldownUntil: null,
        leaseUntil: null,
      });
    expect(await service.confirm("other-position", "receipt")).toEqual({ ok: false, reason: "not_found" });
    expect(await service.confirm("position", "receipt")).toEqual({ ok: false, reason: "lookup_expired" });
    vi.mocked(repository.position).mockResolvedValue({ currency: "EUR" });
    expect(await service.confirm("position", "receipt")).toEqual({ ok: false, reason: "incompatible_currency" });
    expect(repository.confirm).not.toHaveBeenCalled();
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
  });
});
