import type { createClient } from "@/lib/supabase";
import { readDecimal } from "@/lib/decimal";
import { serviceError } from "@/lib/observability/reporter";
import { readAll } from "@/lib/services/read-all";
import type { MarketCurrency, MarketListing, MarketQuote, MarketQuoteOutcome } from "@/types";

export interface PriceCache extends MarketListing {
  id: string;
  price: string | null;
  marketAt: string | null;
  marketDate: string | null;
  fetchedAt: string | null;
  marketState: MarketQuote["marketState"] | null;
  delayMinutes: number | null;
  sourceIntervalMinutes: number | null;
  sourceName: string | null;
  cooldownUntil: string | null;
  leaseUntil: string | null;
}
export interface LookupReceipt {
  id: string;
  cacheId: string | null;
  validUntil: string | null;
  cooldownUntil: string | null;
  leaseUntil: string | null;
}
export interface PriceRepository {
  downloadListings: (positionIds?: string[]) => Promise<PriceCache[] | null>;
  position: (id: string) => Promise<{ currency: MarketCurrency | null } | null>;
  cache: (id: string) => Promise<PriceCache | null>;
  candidate: (symbol: string, currency: MarketCurrency) => Promise<PriceCache | null>;
  ensureCache: (quote: MarketQuote) => Promise<PriceCache>;
  claim: (id: string) => Promise<string | null>;
  release: (id: string, token: string) => Promise<void>;
  finish: (id: string, token: string, result: MarketQuoteOutcome) => Promise<boolean>;
  receipt: (positionId: string, symbol: string) => Promise<LookupReceipt>;
  readReceipt: (positionId: string, id: string) => Promise<LookupReceipt | null>;
  claimLookup: (id: string) => Promise<string | null>;
  finishLookup: (
    id: string,
    token: string,
    cacheId?: string,
    retryAfter?: string,
    release?: boolean,
  ) => Promise<boolean>;
  confirm: (positionId: string, receiptId: string) => Promise<boolean | "incompatible_currency">;
}

const cacheColumns =
  "id,symbol,listing_name,exchange,exchange_name,currency,timezone,instrument_type,price::text,market_at,market_date,fetched_at,market_state,delay_minutes,source_interval_minutes,source_name,cooldown_until,lease_until";
interface CacheRow {
  id: string;
  symbol: string;
  listing_name: string;
  exchange: string;
  exchange_name: string;
  currency: string;
  timezone: string;
  instrument_type: string;
  price: string | null;
  market_at: string | null;
  market_date: string | null;
  fetched_at: string | null;
  market_state: string | null;
  delay_minutes: number | null;
  source_interval_minutes: number | null;
  source_name: string | null;
  cooldown_until: string | null;
  lease_until: string | null;
}
const receiptColumns = "id,cache_id,valid_until,cooldown_until,lease_until";
function receiptRow(row: {
  id: string;
  cache_id: string | null;
  valid_until: string | null;
  cooldown_until: string | null;
  lease_until: string | null;
}): LookupReceipt {
  return {
    id: row.id,
    cacheId: row.cache_id,
    validUntil: row.valid_until,
    cooldownUntil: row.cooldown_until,
    leaseUntil: row.lease_until,
  };
}
function currency(value: string | null): MarketCurrency | null {
  if (value === null || value === "USD" || value === "PLN" || value === "EUR") return value;
  throw new Error("Invalid persisted currency");
}
function cacheRow(row: CacheRow): PriceCache {
  const denomination = currency(row.currency);
  if (!denomination || (row.instrument_type !== "EQUITY" && row.instrument_type !== "ETF"))
    throw new Error("Invalid persisted listing");
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.listing_name,
    exchange: row.exchange,
    exchangeName: row.exchange_name,
    currency: denomination,
    timezone: row.timezone,
    instrumentType: row.instrument_type,
    price: row.price === null ? null : readDecimal(row.price, true),
    marketAt: row.market_at,
    marketDate: row.market_date,
    fetchedAt: row.fetched_at,
    marketState: row.market_state as MarketQuote["marketState"] | null,
    delayMinutes: row.delay_minutes,
    sourceIntervalMinutes: row.source_interval_minutes,
    sourceName: row.source_name,
    cooldownUntil: row.cooldown_until,
    leaseUntil: row.lease_until,
  };
}
/** All access uses the request's authenticated client; never a service-role key. */
export function createPriceRepository(client: ReturnType<typeof createClient>, userId: string): PriceRepository {
  const fail = (error: unknown): never => {
    throw serviceError("marketPrices", error);
  };
  async function cache(id: string) {
    const { data, error } = await client
      .from("market_quote_cache")
      .select(cacheColumns)
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<CacheRow | null, { merge: false }>();
    if (error) return fail(error);
    return data ? cacheRow(data) : null;
  }
  return {
    async downloadListings(positionIds) {
      const positions = await readAll("marketPrices", (from, to) => {
        let query = client
          .from("positions")
          .select("id,market_listing_id")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .is("sell_price", null)
          .is("sell_date", null)
          .not("market_listing_id", "is", null)
          .order("id");
        if (positionIds) query = query.in("id", positionIds);
        return query.range(from, to);
      });
      if (positionIds?.some((id) => !positions.some((p) => p.id === id))) return null;
      const ids = [...new Set(positions.map((p) => p.market_listing_id).filter((id): id is string => id !== null))];
      const rows: PriceCache[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const { data, error } = await client
          .from("market_quote_cache")
          .select(cacheColumns)
          .eq("user_id", userId)
          .in("id", ids.slice(i, i + 50))
          .overrideTypes<CacheRow[], { merge: false }>();
        if (error) return fail(error);
        rows.push(...data.map(cacheRow));
      }
      if (rows.length !== ids.length) throw new Error("Incomplete market listing data");
      return rows;
    },
    async position(id) {
      const { data, error } = await client
        .from("positions")
        .select("id,wallets!positions_wallet_fkey(currency,deleted_at)")
        .eq("user_id", userId)
        .eq("id", id)
        .is("deleted_at", null)
        .is("sell_price", null)
        .is("sell_date", null)
        .maybeSingle();
      if (error) return fail(error);
      return data?.wallets.deleted_at === null ? { currency: currency(data.wallets.currency) } : null;
    },
    cache,
    async candidate(symbol, denomination) {
      const { data, error } = await client
        .from("market_quote_cache")
        .select(cacheColumns)
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .eq("currency", denomination)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .overrideTypes<CacheRow | null, { merge: false }>();
      if (error) return fail(error);
      return data ? cacheRow(data) : null;
    },
    async ensureCache(quote) {
      const l = quote.listing;
      const row = {
        user_id: userId,
        provider: quote.provider,
        symbol: l.symbol,
        exchange: l.exchange,
        currency: l.currency,
        timezone: l.timezone,
        instrument_type: l.instrumentType,
        listing_name: l.name,
        exchange_name: l.exchangeName,
      };
      const inserted = await client
        .from("market_quote_cache")
        .insert(row)
        .select(cacheColumns)
        .single()
        .overrideTypes<CacheRow, { merge: false }>();
      if (!inserted.error) return cacheRow(inserted.data);
      if (inserted.error.code !== "23505") return fail(inserted.error);
      const { data, error } = await client
        .from("market_quote_cache")
        .select(cacheColumns)
        .eq("user_id", userId)
        .eq("provider", quote.provider)
        .eq("symbol", l.symbol)
        .eq("exchange", l.exchange)
        .eq("currency", l.currency)
        .eq("timezone", l.timezone)
        .eq("instrument_type", l.instrumentType)
        .single()
        .overrideTypes<CacheRow, { merge: false }>();
      if (error) return fail(error);
      return cacheRow(data);
    },
    async claim(id) {
      const { data, error } = await client.rpc("claim_market_quote_refresh", { in_cache_id: id });
      if (error) return fail(error);
      return data;
    },
    async release(id, token) {
      const { error } = await client.rpc("release_market_quote_refresh", { in_cache_id: id, in_token: token });
      if (error) fail(error);
    },
    async finish(id, token, result) {
      const q = result.ok ? result.quote : null;
      const { data, error } = await client.rpc("finish_market_quote_refresh", {
        in_cache_id: id,
        in_token: token,
        in_outcome: result.ok ? "success" : result.reason,
        ...(q
          ? {
              in_price: q.price,
              in_market_at: q.marketAt,
              in_market_date: q.marketDate,
              in_fetched_at: q.fetchedAt,
              in_market_state: q.marketState,
              ...(q.delayMinutes !== null ? { in_delay_minutes: String(q.delayMinutes) } : {}),
              ...(q.sourceIntervalMinutes !== null
                ? { in_source_interval_minutes: String(q.sourceIntervalMinutes) }
                : {}),
              ...(q.sourceName !== null ? { in_source_name: q.sourceName } : {}),
            }
          : {}),
        ...(!result.ok && result.retryAfter ? { in_retry_after: result.retryAfter } : {}),
      });
      if (error) return fail(error);
      return data;
    },
    async receipt(positionId, symbol) {
      const inserted = await client
        .from("market_listing_lookups")
        .insert({ user_id: userId, position_id: positionId, symbol })
        .select(receiptColumns)
        .single();
      if (!inserted.error) return receiptRow(inserted.data);
      if (inserted.error.code !== "23505") return fail(inserted.error);
      const { data, error } = await client
        .from("market_listing_lookups")
        .select(receiptColumns)
        .eq("user_id", userId)
        .eq("position_id", positionId)
        .eq("symbol", symbol)
        .single();
      if (error) return fail(error);
      return receiptRow(data);
    },
    async readReceipt(positionId, id) {
      const { data, error } = await client
        .from("market_listing_lookups")
        .select(receiptColumns)
        .eq("user_id", userId)
        .eq("position_id", positionId)
        .eq("id", id)
        .maybeSingle();
      if (error) return fail(error);
      return data ? receiptRow(data) : null;
    },
    async claimLookup(id) {
      const { data, error } = await client.rpc("claim_listing_lookup", { in_lookup_id: id });
      if (error) return fail(error);
      return data;
    },
    async finishLookup(id, token, cacheId, retryAfter, release = false) {
      const { data, error } = await client.rpc("finish_listing_lookup", {
        in_lookup_id: id,
        in_token: token,
        ...(cacheId ? { in_cache_id: cacheId } : {}),
        ...(retryAfter ? { in_retry_after: retryAfter } : {}),
        in_release: release,
      });
      if (error) return fail(error);
      return data;
    },
    async confirm(positionId, receiptId) {
      const { data, error } = await client.rpc("confirm_listing_lookup", {
        in_lookup_id: receiptId,
        in_position_id: positionId,
      });
      if (error?.code === "23514") return "incompatible_currency";
      if (error) return fail(error);
      return data;
    },
  };
}
