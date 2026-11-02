import type { createClient } from "@/lib/supabase";
import { createYahooMarketData } from "@/lib/market-data/yahoo";
import { serviceError, reportUnexpected } from "@/lib/observability/reporter";
import { isUuid } from "@/lib/validation/uuid";
import type { MarketSelectionChoice, MarketPriceServiceFailure } from "@/types";

type Client = ReturnType<typeof createClient>;
const projection =
  "id,valid_until,market_listing_targets!market_selection_receipts_target_id_user_id_fkey(id,symbol,listing_name,exchange,exchange_name,instrument_type)";
interface ReceiptRow {
  id: string;
  valid_until: string;
  market_listing_targets: {
    id: string;
    symbol: string;
    listing_name: string;
    exchange: string;
    exchange_name: string;
    instrument_type: string;
  };
}
function choice(row: ReceiptRow): MarketSelectionChoice {
  const target = row.market_listing_targets;
  if (target.instrument_type !== "EQUITY" && target.instrument_type !== "ETF")
    throw new Error("Invalid stored selection");
  return {
    receiptId: row.id,
    targetId: target.id,
    validUntil: row.valid_until,
    symbol: target.symbol,
    name: target.listing_name,
    exchange: target.exchange,
    exchangeName: target.exchange_name,
    instrumentType: target.instrument_type,
  };
}
/** Receipt expiry applies to an unsaved form, never to an existing durable holding. */
export async function readMarketSelection(
  client: Client,
  userId: string,
  walletId: string,
  receiptId: string,
): Promise<MarketSelectionChoice | null> {
  if (!isUuid(walletId) || !isUuid(receiptId)) return null;
  const wallet = await client
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("id", walletId)
    .is("deleted_at", null)
    .maybeSingle();
  if (wallet.error) throw serviceError("marketPrices", wallet.error);
  if (!wallet.data) return null;
  const result = await client
    .from("market_selection_receipts")
    .select(projection)
    .eq("user_id", userId)
    .eq("wallet_id", walletId)
    .eq("id", receiptId)
    .gt("valid_until", new Date().toISOString())
    .maybeSingle()
    .overrideTypes<ReceiptRow | null, { merge: false }>();
  if (result.error) throw serviceError("marketPrices", result.error);
  return result.data ? choice(result.data) : null;
}
/** Only an explicit search action calls the provider; only its query leaves the diary. */
export async function searchMarketSelections(
  client: Client,
  userId: string,
  walletId: string,
  query: string,
  signal?: AbortSignal,
  provider = createYahooMarketData(),
): Promise<{ ok: true; choices: MarketSelectionChoice[] } | MarketPriceServiceFailure> {
  if (!isUuid(walletId) || query.trim().length < 2 || query.trim().length > 100)
    return { ok: false, reason: "invalid_request" };
  const wallet = await client
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("id", walletId)
    .is("deleted_at", null)
    .maybeSingle();
  if (wallet.error) throw serviceError("marketPrices", wallet.error);
  if (!wallet.data) return { ok: false, reason: "not_found" };
  const result = await provider.searchListings(query.trim(), { signal });
  if (!result.ok) {
    if (result.reason !== "cancelled")
      reportUnexpected(new Error("Market search failed"), { operation: "marketPrices" });
    return result;
  }
  const choices: MarketSelectionChoice[] = [];
  for (const candidate of result.listings) {
    const inserted = await client
      .from("market_listing_targets")
      .insert({
        user_id: userId,
        provider: "yahoo",
        symbol: candidate.symbol,
        exchange: candidate.exchange,
        listing_name: candidate.name,
        exchange_name: candidate.exchangeName,
        instrument_type: candidate.instrumentType,
      })
      .select("id")
      .single();
    let targetId = inserted.data?.id;
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw serviceError("marketPrices", inserted.error);
      const existing = await client
        .from("market_listing_targets")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "yahoo")
        .eq("symbol", candidate.symbol)
        .eq("exchange", candidate.exchange)
        .eq("instrument_type", candidate.instrumentType)
        .single();
      if (existing.error) throw serviceError("marketPrices", existing.error);
      targetId = existing.data.id;
    }
    if (!targetId) throw new Error("Missing persisted search target");
    const receipt = await client
      .from("market_selection_receipts")
      .insert({ user_id: userId, wallet_id: walletId, target_id: targetId })
      .select(projection)
      .single()
      .overrideTypes<ReceiptRow, { merge: false }>();
    if (receipt.error) throw serviceError("marketPrices", receipt.error);
    choices.push(choice(receipt.data));
  }
  return { ok: true, choices };
}
