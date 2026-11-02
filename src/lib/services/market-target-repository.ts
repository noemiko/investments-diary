import type { createClient } from "@/lib/supabase";
import { readAll } from "./read-all";
import { serviceError } from "@/lib/observability/reporter";
import type { MarketListingCandidate, MarketQuoteOutcome } from "@/types";

export interface PendingTarget extends MarketListingCandidate {
  id: string;
  cacheId: string | null;
  cooldownUntil: string | null;
  leaseUntil: string | null;
}
export interface TargetRepository {
  list: (positionIds?: string[]) => Promise<PendingTarget[]>;
  read: (id: string) => Promise<PendingTarget | null>;
  canonical: (target: PendingTarget) => Promise<string | null | false>;
  claim: (id: string) => Promise<string | null>;
  finish: (id: string, token: string, result: MarketQuoteOutcome, cacheId?: string) => Promise<number>;
  release: (id: string, token: string) => Promise<void>;
}
const columns = "id,symbol,listing_name,exchange,exchange_name,instrument_type,cache_id,cooldown_until,lease_until";
interface Row {
  id: string;
  symbol: string;
  listing_name: string;
  exchange: string;
  exchange_name: string;
  instrument_type: string;
  cache_id: string | null;
  cooldown_until: string | null;
  lease_until: string | null;
}
function decode(row: Row): PendingTarget {
  if (row.instrument_type !== "EQUITY" && row.instrument_type !== "ETF") throw new Error("Invalid pending listing");
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.listing_name,
    exchange: row.exchange,
    exchangeName: row.exchange_name,
    instrumentType: row.instrument_type,
    cacheId: row.cache_id,
    cooldownUntil: row.cooldown_until,
    leaseUntil: row.lease_until,
  };
}
export function createTargetRepository(client: ReturnType<typeof createClient>, userId: string): TargetRepository {
  const fail = (error: unknown): never => {
    throw serviceError("marketPrices", error);
  };
  return {
    async list(positionIds) {
      const positions = await readAll("marketPrices", (from, to) => {
        let query = client
          .from("positions")
          .select("id,market_target_id")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .is("sell_price", null)
          .is("sell_date", null)
          .is("market_listing_id", null)
          .order("id");
        if (positionIds) query = query.in("id", positionIds);
        return query.range(from, to);
      });
      // Every holding has a selection (NOT NULL); unlinked open ones are pending download.
      const ids = [...new Set(positions.map((p) => p.market_target_id))];
      const targets: PendingTarget[] = [];
      for (let start = 0; start < ids.length; start += 50) {
        const result = await client
          .from("market_listing_targets")
          .select(columns)
          .eq("user_id", userId)
          .in("id", ids.slice(start, start + 50))
          .order("id");
        if (result.error) return fail(result.error);
        targets.push(...result.data.map(decode));
      }
      return targets;
    },
    async read(id) {
      const result = await client
        .from("market_listing_targets")
        .select(columns)
        .eq("user_id", userId)
        .eq("id", id)
        .maybeSingle();
      if (result.error) return fail(result.error);
      return result.data ? decode(result.data) : null;
    },
    async canonical(target) {
      if (target.cacheId) return target.cacheId;
      const result = await client
        .from("market_quote_cache")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "yahoo")
        .eq("symbol", target.symbol)
        .eq("exchange", target.exchange)
        .eq("instrument_type", target.instrumentType)
        .limit(2);
      if (result.error) return fail(result.error);
      return result.data.length > 1 ? false : (result.data[0]?.id ?? null);
    },
    async claim(id) {
      const result = await client.rpc("claim_market_target", { in_target_id: id });
      if (result.error) return fail(result.error);
      return result.data || null;
    },
    async finish(id, token, result, cacheId) {
      const saved = await client.rpc("finish_market_target", {
        in_target_id: id,
        in_token: token,
        in_outcome: result.ok ? "success" : result.reason,
        ...(cacheId ? { in_cache_id: cacheId } : {}),
        ...(!result.ok && result.retryAfter ? { in_retry_after: result.retryAfter } : {}),
      });
      if (saved.error) return fail(saved.error);
      return saved.data;
    },
    async release(id, token) {
      const result = await client.rpc("finish_market_target", {
        in_target_id: id,
        in_token: token,
        in_outcome: "cancelled",
        in_release: true,
      });
      if (result.error) fail(result.error);
    },
  };
}
