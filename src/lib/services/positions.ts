import { reportUnexpected, serviceError } from "@/lib/observability/reporter";
import {
  composeEffectivePrice,
  EFFECTIVE_PRICE_COLUMNS,
  type EffectivePriceTransport,
} from "@/lib/services/effective-price";
import type { PostgrestError } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase";
import { readAll } from "@/lib/services/read-all";
import { readMarketSelection } from "@/lib/services/market-selections";
import type {
  ClosePositionInput,
  ConfrontationPosition,
  DeletedPositionItem,
  NewPositionInput,
  MovePositionInput,
  PositionDetail,
  PositionListItem,
  PriceUpdateInput,
  ReasonCategory,
} from "@/types";

// Always the request-scoped client, so RLS scopes every query to the signed-in author.
type Client = ReturnType<typeof createClient>;
type PositionListTransport = Omit<PositionListItem, "category_name" | "wallet_name" | "valuation"> &
  EffectivePriceTransport & {
    wallets: { name: string };
    reason_categories: { name: string };
  };
type PositionDetailTransport = PositionListTransport & Pick<PositionDetail, "reason_text">;

export type CreatePositionError =
  "validation" | "category_not_found" | "wallet_not_found" | "selection_invalid" | "unexpected";

export type CreatePositionResult = { ok: true; id: string } | { ok: false; error: CreatePositionError };

export type UpdatePriceResult = { ok: true } | { ok: false; error: "not_found" | "validation" | "unexpected" };
export type SoftDeleteResult = { ok: true } | { ok: false; error: "not_found" | "unexpected" };

const FOREIGN_KEY_VIOLATION = "23503";
export const UNIQUE_VIOLATION = "23505";
// Named in 20261019112848_create_wallets.sql; the category FK shares the same error code.
const WALLET_FOREIGN_KEY = "positions_wallet_fkey";
// check_violation, not_null_violation, string_data_right_truncation, numeric_value_out_of_range,
// invalid_text_representation, invalid_datetime_format: the database refused a value the form let through.
export const VALIDATION_CODES = new Set(["23514", "23502", "22001", "22003", "22P02", "22007", "22008"]);

// One reporting boundary for unexpected write results; expected domain outcomes stay quiet.
export function logUnexpected(where: string, error: unknown) {
  reportUnexpected(error, { operation: where });
}

function failure(error: PostgrestError): CreatePositionResult {
  if (error.code === FOREIGN_KEY_VIOLATION) {
    return { ok: false, error: error.message.includes(WALLET_FOREIGN_KEY) ? "wallet_not_found" : "category_not_found" };
  }
  if (VALIDATION_CODES.has(error.code)) return { ok: false, error: "validation" };
  logUnexpected("createPosition", error);
  return { ok: false, error: "unexpected" };
}

/** The author's non-deleted categories, ordered by name. */
export async function listCategories(client: Client): Promise<ReasonCategory[]> {
  const { data, error } = await client
    .from("reason_categories")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw serviceError("listCategories", error);
  return data;
}

/** The author's non-deleted positions with their category name, newest buy first. */
export async function listPositions(client: Client, walletId?: string): Promise<PositionListItem[]> {
  const data = await readAll("listPositions", (from, to) => {
    let query = client
      .from("position_effective_prices")
      .select(
        `id, instrument, buy_date, buy_price::text, quantity::text, broker_label, current_price::text, price_date, sell_price::text, sell_date, wallet_id, wallets!positions_wallet_fkey(name), reason_categories(name),${EFFECTIVE_PRICE_COLUMNS}`,
      )
      .is("deleted_at", null)
      .order("buy_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (walletId !== undefined) query = query.eq("wallet_id", walletId);
    return query.range(from, to).overrideTypes<PositionListTransport[], { merge: false }>();
  });
  return data.map(({ reason_categories, wallets, ...position }) => ({
    ...composeEffectivePrice(position),
    category_name: reason_categories.name,
    wallet_name: wallets.name,
  }));
}

/**
 * Every non-deleted position of the author, reason included, newest buy first. One read for all
 * categories, so the new-investment form can switch category without another round trip.
 */
export async function listConfrontationPositions(client: Client): Promise<ConfrontationPosition[]> {
  const rows = await readAll("listConfrontationPositions", (from, to) =>
    client
      .from("position_effective_prices")
      .select(
        `id, category_id, instrument, buy_date, buy_price::text, quantity::text, current_price::text, price_date, sell_price::text, sell_date, reason_text,${EFFECTIVE_PRICE_COLUMNS}`,
      )
      .is("deleted_at", null)
      .order("buy_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
      .overrideTypes<(ConfrontationPosition & EffectivePriceTransport)[], { merge: false }>(),
  );
  return rows.map(composeEffectivePrice);
}

/**
 * One of the author's non-deleted positions, or null. Missing, foreign (hidden by RLS) and deleted
 * ids all give null, so a caller cannot tell them apart. RLS checks only ownership, hence the
 * explicit `deleted_at` filter.
 */
export async function getPosition(client: Client, id: string): Promise<PositionDetail | null> {
  const { data, error } = await client
    .from("position_effective_prices")
    .select(
      `id, instrument, buy_date, buy_price::text, quantity::text, broker_label, current_price::text, price_date, sell_price::text, sell_date, reason_text, wallet_id, wallets!positions_wallet_fkey(name), reason_categories(name),${EFFECTIVE_PRICE_COLUMNS}`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
    .overrideTypes<PositionDetailTransport | null, { merge: false }>();
  if (error) throw serviceError("getPosition", error);
  if (!data) return null;
  const { reason_categories, wallets, ...position } = data;
  return { ...composeEffectivePrice(position), category_name: reason_categories.name, wallet_name: wallets.name };
}

/** Replaces a non-deleted position's current price and its date (FR-006); no other column changes. */
export async function updatePositionPrice(
  client: Client,
  id: string,
  input: PriceUpdateInput,
): Promise<UpdatePriceResult> {
  const { data, error } = await client
    .from("positions")
    .update({ current_price: input.current_price, price_date: input.price_date })
    .eq("id", id)
    .is("deleted_at", null)
    .is("sell_price", null)
    .is("sell_date", null)
    .select("id");
  if (error) {
    if (VALIDATION_CODES.has(error.code)) return { ok: false, error: "validation" };
    logUnexpected("updatePositionPrice", error);
    return { ok: false, error: "unexpected" };
  }
  // Zero rows: missing, foreign (RLS) or deleted — all the same to the caller.
  if (data.length === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}

/** The author's deleted positions with their category name, most recently deleted first (FR-009). */
export async function listDeletedPositions(client: Client): Promise<DeletedPositionItem[]> {
  const { data, error } = await client
    .from("positions")
    .select("id, instrument, buy_date, deleted_at, reason_categories(name)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw serviceError("listDeletedPositions", error);
  return data.map(({ reason_categories, ...position }) => ({
    ...position,
    category_name: reason_categories.name,
  }));
}

// An update that RLS hides (another author's row) or that the state filter excludes affects zero
// rows without an error, so zero rows is the not-found signal.
function softDeleteOutcome(
  where: string,
  { data, error }: { data: { id: string }[] | null; error: PostgrestError | null },
): SoftDeleteResult {
  if (error) {
    logUnexpected(where, error);
    return { ok: false, error: "unexpected" };
  }
  if (!data || data.length === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}

/** Soft-deletes one of the author's non-deleted positions (FR-009). */
export async function deletePosition(client: Client, id: string): Promise<SoftDeleteResult> {
  const result = await client
    .from("positions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  return softDeleteOutcome("deletePosition", result);
}

/** Restores one of the author's deleted positions (FR-009). */
export async function restorePosition(client: Client, id: string): Promise<SoftDeleteResult> {
  const result = await client
    .from("positions")
    .update({ deleted_at: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id");
  return softDeleteOutcome("restorePosition", result);
}

// Matches the unique index on (user_id, lower(name)) among non-deleted categories.
// Compared in code rather than with `ilike`, whose `%`, `_` and `*` would act as wildcards in a name.
async function findCategoryId(client: Client, name: string): Promise<string | null> {
  const wanted = name.toLowerCase();
  const categories = await listCategories(client);
  return categories.find((category) => category.name.toLowerCase() === wanted)?.id ?? null;
}

async function findOrCreateCategory(
  client: Client,
  userId: string,
  name: string,
): Promise<{ id: string } | { error: PostgrestError | null }> {
  const existing = await findCategoryId(client, name);
  if (existing) return { id: existing };

  const { data, error } = await client
    .from("reason_categories")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  if (!error) return { id: data.id };

  // Another request created the same name between our select and insert: use that row.
  if (error.code === UNIQUE_VIOLATION) {
    const raced = await findCategoryId(client, name);
    if (raced) return { id: raced };
    return { error: null };
  }
  return { error };
}

/**
 * Records a position, creating its category first when the author typed a new one.
 * A category created here stays behind if the position insert then fails; that is acceptable.
 */
export async function createPosition(
  client: Client,
  userId: string,
  input: NewPositionInput,
): Promise<CreatePositionResult> {
  let selection;
  try {
    selection = await readMarketSelection(client, userId, input.wallet_id, input.listing_receipt_id);
  } catch (error) {
    logUnexpected("createPosition", error);
    return { ok: false, error: "unexpected" };
  }
  if (!selection) return { ok: false, error: "selection_invalid" };
  let categoryId: string;
  if (input.category_id === null) {
    let category: Awaited<ReturnType<typeof findOrCreateCategory>>;
    try {
      category = await findOrCreateCategory(client, userId, input.new_category_name);
    } catch (error) {
      logUnexpected("findOrCreateCategory", error);
      return { ok: false, error: "unexpected" };
    }
    if ("error" in category) {
      if (category.error) return failure(category.error);
      logUnexpected("findOrCreateCategory", { message: "unique violation, but no matching category on re-select" });
      return { ok: false, error: "unexpected" };
    }
    categoryId = category.id;
  } else {
    categoryId = input.category_id;
  }

  const { data, error } = await client
    .from("positions")
    .insert({
      user_id: userId,
      instrument: selection.symbol,
      market_selection_receipt_id: selection.receiptId,
      buy_date: input.buy_date,
      buy_price: input.buy_price,
      quantity: input.quantity,
      broker_label: input.broker_label,
      reason_text: input.reason_text,
      category_id: categoryId,
      wallet_id: input.wallet_id,
    })
    .select("id")
    .single();
  if (error) return failure(error);
  return { ok: true, id: data.id };
}

export type ClosePositionResult = { ok: true } | { ok: false; error: "not_found" | "validation" | "unexpected" };

/** Atomically closes an open, non-deleted position (FR-007), preserving its retained quote. */
export async function closePosition(
  client: Client,
  id: string,
  input: ClosePositionInput,
): Promise<ClosePositionResult> {
  try {
    const { data, error } = await client
      .from("positions")
      .update({ sell_price: input.sell_price, sell_date: input.sell_date })
      .eq("id", id)
      .is("deleted_at", null)
      .is("sell_price", null)
      .is("sell_date", null)
      .select("id");
    if (error) {
      if (VALIDATION_CODES.has(error.code)) return { ok: false, error: "validation" };
      logUnexpected("closePosition", error);
      return { ok: false, error: "unexpected" };
    }
    if (data.length === 0) return { ok: false, error: "not_found" };
    return { ok: true };
  } catch (error) {
    logUnexpected("closePosition", error);
    return { ok: false, error: "unexpected" };
  }
}

export type MovePositionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "incompatible_currency" | "unexpected";
    };
/** Atomic owner/denomination checks live in SQL, including direct-write protection. */
export async function movePosition(client: Client, id: string, input: MovePositionInput): Promise<MovePositionResult> {
  const { data, error } = await client.rpc("move_position_to_wallet", {
    in_position_id: id,
    in_wallet_id: input.wallet_id,
  });
  if (error) {
    logUnexpected("movePosition", error);
    return { ok: false, reason: "unexpected" };
  }
  if (data === "success") return { ok: true };
  if (data === "not_found" || data === "incompatible_currency") return { ok: false, reason: data };
  logUnexpected("movePosition", new Error("Unknown move result"));
  return { ok: false, reason: "unexpected" };
}
