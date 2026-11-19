import type { createClient } from "@/lib/supabase";
import { createYahooMarketData } from "@/lib/market-data/yahoo";
import { providerBudget, quoteBatches } from "@/lib/market-data/refresh-policy";
import { reportUnexpected } from "@/lib/observability/reporter";
import { safeStatus } from "@/lib/observability/privacy";
import { createPriceRepository, type PriceCache, type PriceRepository } from "./market-price-repository";
import { createTargetRepository, type TargetRepository } from "./market-target-repository";
import type {
  MarketDataFailure,
  MarketListing,
  MarketPriceDownloadItem,
  MarketPriceServiceFailure,
  MarketQuote,
  MarketQuoteOutcome,
} from "@/types";
export type MarketDataProvider = ReturnType<typeof createYahooMarketData>;
interface ServiceOptions {
  provider?: MarketDataProvider;
  repository?: PriceRepository;
  targets?: TargetRepository;
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
function report(
  stage: "quote_batch" | "listing_confirm",
  reason: MarketDataFailure["reason"],
  status?: number | string,
  affectedCount?: number,
) {
  // Never pass provider errors, URLs or response payloads to logging/Sentry.
  if (reason === "cancelled" || reason === "not_found") return;
  reportUnexpected(Object.assign(new Error("Market data operation failed"), { status }), {
    operation: "marketPrices",
    market: { stage, reason, affectedCount },
  });
}
/**
 * Provider calls exist only in the explicit Download prices method, never in read composition.
 * Existing-position listing search/lookup/confirm was retired on 2026-11-02 (one stock identity per
 * holding); its database RPCs are no longer executable by signed-in users.
 */
export function createMarketPriceService(
  client: ReturnType<typeof createClient>,
  userId: string,
  options: ServiceOptions = {},
) {
  const repository = options.repository ?? createPriceRepository(client, userId);
  const targets = options.targets ?? createTargetRepository(client, userId);
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
  async function download(
    positionIds?: string[],
    signal?: AbortSignal,
  ): Promise<{ ok: true; results: MarketPriceDownloadItem[] } | MarketPriceServiceFailure> {
    const listings = await repository.downloadListings(positionIds);
    if (listings === null) return { ok: false, reason: "not_found" };
    const pendingTargets = await targets.list(positionIds);
    const unique = [...new Map(listings.map((row) => [row.id, row])).values()];
    const results: MarketPriceDownloadItem[] = [];
    const completed = new Map<string, { item: MarketPriceDownloadItem; quote: MarketQuoteOutcome | null }>();
    const budget = providerBudget(signal, options.budgetMs);
    const isStopped = () => budget.stopped;
    try {
      for (const batch of quoteBatches(unique)) {
        const claimed: { row: PriceCache; token: string }[] = [];
        for (const row of batch) {
          if (isStopped()) {
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
        if (isStopped()) {
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
        const members = claimed.map(({ row, token }) => {
          const member: MarketQuoteOutcome = outcome.ok
            ? (outcome.quotes[row.symbol] ?? { ok: false, reason: "not_found" })
            : quoteFailure(outcome);
          return { row, token, member };
        });
        if (outcome.ok) {
          const summaries = new Map<MarketDataFailure["reason"], { count: number; status: string | undefined }>();
          for (const { member } of members) {
            if (member.ok || member.reason === "cancelled" || member.reason === "not_found") continue;
            const status = safeStatus(member.status);
            const summary = summaries.get(member.reason);
            if (summary) {
              summary.count++;
              if (summary.status !== status) summary.status = undefined;
            } else summaries.set(member.reason, { count: 1, status });
          }
          for (const [reason, { status, count }] of summaries) report("quote_batch", reason, status, count);
        } else report("quote_batch", outcome.reason, outcome.status, claimed.length);

        for (const { row, token, member } of members) {
          const accepted = await repository.finish(row.id, token, member);
          const persisted = !member.ok || !accepted ? await repository.cache(row.id) : null;
          const item: MarketPriceDownloadItem = {
            listingId: row.id,
            symbol: row.symbol,
            outcome: member.ok ? (accepted ? "success" : "older_quote") : member.reason,
            retryAfter: persisted?.cooldownUntil ?? null,
          };
          results.push(item);
          const saved = member.ok ? await repository.cache(row.id) : null;
          const selected = saved ? cachedQuote(saved) : null;
          completed.set(row.id, {
            item,
            quote: member.ok ? (selected ? { ok: true, quote: selected } : null) : member,
          });
        }
      }
      for (const target of pendingTargets) {
        const item = (
          outcome: MarketPriceDownloadItem["outcome"],
          retryAfter: string | null = null,
        ): MarketPriceDownloadItem => ({ listingId: target.id, symbol: target.symbol, outcome, retryAfter });
        if (isStopped()) {
          results.push(item("due"));
          continue;
        }
        const token = await targets.claim(target.id);
        if (!token) {
          const state = blocked(await targets.read(target.id));
          results.push(item(state.reason, state.retryAfter));
          continue;
        }
        const canonicalId = await targets.canonical(target);
        if (canonicalId === false) {
          await targets.finish(target.id, token, { ok: false, reason: "invalid_quote" });
          const state = await targets.read(target.id);
          results.push(item("invalid_quote", state?.cooldownUntil ?? null));
          continue;
        }
        let cached = canonicalId ? await repository.cache(canonicalId) : null;
        let cacheToken: string | null = null;
        let outcome = canonicalId ? completed.get(canonicalId) : undefined;
        if (!outcome) {
          if (cached) {
            cacheToken = await repository.claim(cached.id);
            if (!cacheToken) {
              await targets.release(target.id, token);
              const state = blocked(await repository.cache(cached.id));
              results.push(item(state.reason, state.retryAfter));
              continue;
            }
          }
          if (isStopped()) {
            if (cached && cacheToken) await repository.release(cached.id, cacheToken);
            await targets.release(target.id, token);
            results.push(item("due"));
            continue;
          }
          const response = await budget.run(async (operationSignal): Promise<MarketQuoteOutcome> => {
            if (!cached) return api().confirmListing(target.symbol, { signal: operationSignal });
            const batch = await api().fetchQuotes([identity(cached)], { signal: operationSignal });
            return batch.ok ? (batch.quotes[target.symbol] ?? { ok: false, reason: "not_found" }) : batch;
          });
          let member: MarketQuoteOutcome = response.ok ? response.value : response;
          if (
            member.ok &&
            (member.quote.listing.symbol !== target.symbol ||
              member.quote.listing.exchange !== target.exchange ||
              member.quote.listing.instrumentType !== target.instrumentType)
          )
            member = { ok: false, reason: "invalid_quote" };
          if (!member.ok) {
            report(cached ? "quote_batch" : "listing_confirm", member.reason, member.status, cached ? 1 : undefined);
            member = quoteFailure(member);
          }
          if (member.ok) {
            cached ??= await repository.ensureCache(member.quote);
            cacheToken ??= await repository.claim(cached.id);
            if (!cacheToken) {
              await targets.release(target.id, token);
              const state = blocked(await repository.cache(cached.id));
              results.push(item(state.reason, state.retryAfter));
              continue;
            }
          }
          let accepted = true;
          if (cached && cacheToken) accepted = await repository.finish(cached.id, cacheToken, member);
          const saved = cached && member.ok ? await repository.cache(cached.id) : null;
          const selected = saved ? cachedQuote(saved) : null;
          const persisted = cached && (!member.ok || !accepted) ? await repository.cache(cached.id) : null;
          outcome = {
            item: item(
              member.ok ? (accepted ? "success" : "older_quote") : member.reason,
              persisted?.cooldownUntil ?? (!member.ok ? (member.retryAfter ?? null) : null),
            ),
            quote: member.ok ? (selected ? { ok: true, quote: selected } : null) : member,
          };
          if (cached) completed.set(cached.id, outcome);
        }
        if (outcome.quote?.ok && cached) {
          const mismatches = await targets.finish(target.id, token, outcome.quote, cached.id);
          if (mismatches < 0) {
            results.push(item("due"));
            continue;
          }
          results.push({
            ...item(mismatches > 0 ? "incompatible_currency" : outcome.item.outcome, outcome.item.retryAfter),
            ...(mismatches > 0 ? { incompatibleCount: mismatches } : {}),
          });
        } else if (outcome.quote && !outcome.quote.ok) {
          await targets.finish(target.id, token, outcome.quote);
          const state = await targets.read(target.id);
          results.push(item(outcome.quote.reason, state?.cooldownUntil ?? outcome.quote.retryAfter ?? null));
        } else {
          await targets.release(target.id, token);
          results.push(item(outcome.item.outcome, outcome.item.retryAfter));
        }
      }
      return { ok: true, results };
    } finally {
      budget.dispose();
    }
  }
  return { download };
}
