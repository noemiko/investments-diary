import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiDatabase } from "@/db/api.types";

/**
 * Every position needs a stock selection. Fixtures create it through the same owner- and
 * wallet-bound receipt path the new-investment form uses; the guard then labels the position
 * with the target's symbol. Deterministic provider metadata only — never a Yahoo call.
 */
export async function selectionReceipt(
  client: SupabaseClient<ApiDatabase>,
  owner: string,
  walletId: string,
  symbol: string,
  exchange = "NMS",
): Promise<string> {
  const existing = await client
    .from("market_listing_targets")
    .select("id")
    .eq("user_id", owner)
    .eq("provider", "yahoo")
    .eq("symbol", symbol)
    .eq("exchange", exchange)
    .eq("instrument_type", "EQUITY")
    .maybeSingle();
  if (existing.error) throw existing.error;
  let targetId = existing.data?.id;
  if (!targetId) {
    const created = await client
      .from("market_listing_targets")
      .insert({
        user_id: owner,
        provider: "yahoo",
        symbol,
        exchange,
        listing_name: `${symbol} fixture`,
        exchange_name: exchange,
        instrument_type: "EQUITY",
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    targetId = created.data.id;
  }
  const receipt = await client
    .from("market_selection_receipts")
    .insert({ user_id: owner, wallet_id: walletId, target_id: targetId })
    .select("id")
    .single();
  if (receipt.error) throw receipt.error;
  return receipt.data.id;
}
