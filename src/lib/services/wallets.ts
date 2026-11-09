import { serviceError } from "@/lib/observability/reporter";
import { readDecimal } from "@/lib/decimal";
import {
  composeEffectivePrice,
  EFFECTIVE_PRICE_COLUMNS,
  type EffectivePriceTransport,
} from "@/lib/services/effective-price";
import type { PostgrestError } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase";
import { readAll } from "@/lib/services/read-all";
import { logUnexpected, UNIQUE_VIOLATION, VALIDATION_CODES } from "@/lib/services/positions";
import { MARKET_CURRENCIES, type MarketCurrency, type Wallet, type WalletInput, type WalletPosition } from "@/types";

// Always the request-scoped client, so RLS scopes every query to the signed-in author.
type Client = ReturnType<typeof createClient>;

export type CreateWalletResult =
  { ok: true; id: string } | { ok: false; error: "name_taken" | "validation" | "unexpected" };
export type UpdateWalletResult =
  { ok: true } | { ok: false; error: "not_found" | "name_taken" | "validation" | "unexpected" };

function failure(
  where: string,
  error: PostgrestError,
): { ok: false; error: "name_taken" | "validation" | "unexpected" } {
  // The only unique index on wallets is (user_id, lower(name)) among non-deleted wallets.
  if (error.code === UNIQUE_VIOLATION) return { ok: false, error: "name_taken" };
  if (VALIDATION_CODES.has(error.code)) return { ok: false, error: "validation" };
  logUnexpected(where, error);
  return { ok: false, error: "unexpected" };
}

/** The author's non-deleted wallets, ordered by name. */
export async function listWallets(client: Client): Promise<Wallet[]> {
  const { data, error } = await client
    .from("wallets")
    .select("id, name, starting_value::text, currency")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw serviceError("listWallets", error);
  return data.map((wallet) => ({
    ...wallet,
    starting_value: readDecimal(wallet.starting_value),
    currency: walletCurrency(wallet.currency),
  }));
}

/**
 * One of the author's non-deleted wallets, or null. Missing, foreign (hidden by RLS) and deleted
 * ids all give null, as `getPosition` does.
 */
export async function getWallet(client: Client, id: string): Promise<Wallet | null> {
  const { data, error } = await client
    .from("wallets")
    .select("id, name, starting_value::text, currency")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw serviceError("getWallet", error);
  return data
    ? { ...data, starting_value: readDecimal(data.starting_value), currency: walletCurrency(data.currency) }
    : null;
}

/** Every non-deleted position of the author, with only the fields a wallet's value needs. */
export async function listWalletPositions(client: Client): Promise<WalletPosition[]> {
  const rows = await readAll("listWalletPositions", (from, to) =>
    client
      .from("position_effective_prices")
      .select(
        `wallet_id, buy_price::text, opening_commission::text, closing_commission::text, quantity::text, current_price::text, price_date, sell_price::text, sell_date,${EFFECTIVE_PRICE_COLUMNS}`,
      )
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<(WalletPosition & EffectivePriceTransport)[], { merge: false }>(),
  );
  return rows.map(composeEffectivePrice);
}

/** Creates a wallet for the author (FR-013). */
export async function createWallet(client: Client, userId: string, input: WalletInput): Promise<CreateWalletResult> {
  const { data, error } = await client
    .from("wallets")
    .insert({
      user_id: userId,
      name: input.name,
      starting_value: input.starting_value,
      currency: input.currency,
    })
    .select("id")
    .single();
  if (error) return failure("createWallet", error);
  return { ok: true, id: data.id };
}

/** Renames a non-deleted wallet and/or changes its starting value (FR-013). */
export async function updateWallet(client: Client, id: string, input: WalletInput): Promise<UpdateWalletResult> {
  const { data, error } = await client
    .from("wallets")
    .update({
      name: input.name,
      starting_value: input.starting_value,
      currency: input.currency,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return failure("updateWallet", error);
  // Zero rows: missing, foreign (RLS) or deleted — all the same to the caller.
  if (data.length === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}

function walletCurrency(value: string): MarketCurrency {
  if (!(MARKET_CURRENCIES as readonly string[]).includes(value)) throw new Error("Invalid wallet currency");
  return value as MarketCurrency;
}
