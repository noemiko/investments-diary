import type { PostgrestError } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase";
import type {
  DeletedPositionItem,
  NewPositionInput,
  PositionDetail,
  PositionListItem,
  PriceUpdateInput,
  ReasonCategory,
} from "@/types";

// Always the request-scoped client, so RLS scopes every query to the signed-in author.
type Client = ReturnType<typeof createClient>;

export type CreatePositionError = "validation" | "category_not_found" | "unexpected";

export type CreatePositionResult = { ok: true; id: string } | { ok: false; error: CreatePositionError };

export type UpdatePriceResult = { ok: true } | { ok: false; error: "not_found" | "validation" | "unexpected" };
export type SoftDeleteResult = { ok: true } | { ok: false; error: "not_found" | "unexpected" };

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
// check_violation, not_null_violation, string_data_right_truncation, numeric_value_out_of_range,
// invalid_text_representation, invalid_datetime_format: the database refused a value the form let through.
const VALIDATION_CODES = new Set(["23514", "23502", "22001", "22003", "22P02", "22007", "22008"]);

// Code and message only: `details` can carry the failing row, reason text included.
function logUnexpected(where: string, error: { code?: string; message: string }) {
  // eslint-disable-next-line no-console -- the only trace of a failed save in the function logs
  console.error(`${where} failed`, { code: error.code, message: error.message });
}

function failure(error: PostgrestError): CreatePositionResult {
  if (error.code === FOREIGN_KEY_VIOLATION) return { ok: false, error: "category_not_found" };
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
  if (error) throw new Error(`listCategories failed: ${error.message}`);
  return data;
}

/** The author's non-deleted positions with their category name, newest buy first. */
export async function listPositions(client: Client): Promise<PositionListItem[]> {
  const { data, error } = await client
    .from("positions")
    .select(
      "id, instrument, buy_date, buy_price, quantity, broker_label, current_price, price_date, reason_categories(name)",
    )
    .is("deleted_at", null)
    .order("buy_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPositions failed: ${error.message}`);
  return data.map(({ reason_categories, ...position }) => ({
    ...position,
    category_name: reason_categories.name,
  }));
}

/**
 * One of the author's non-deleted positions, or null. Missing, foreign (hidden by RLS) and deleted
 * ids all give null, so a caller cannot tell them apart. RLS checks only ownership, hence the
 * explicit `deleted_at` filter.
 */
export async function getPosition(client: Client, id: string): Promise<PositionDetail | null> {
  const { data, error } = await client
    .from("positions")
    .select(
      "id, instrument, buy_date, buy_price, quantity, broker_label, current_price, price_date, reason_text, reason_categories(name)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getPosition failed: ${error.message}`);
  if (!data) return null;
  const { reason_categories, ...position } = data;
  return { ...position, category_name: reason_categories.name };
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
  if (error) throw new Error(`listDeletedPositions failed: ${error.message}`);
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
  let categoryId: string;
  if (input.category_id === null) {
    let category: Awaited<ReturnType<typeof findOrCreateCategory>>;
    try {
      category = await findOrCreateCategory(client, userId, input.new_category_name);
    } catch (error) {
      logUnexpected("findOrCreateCategory", { message: error instanceof Error ? error.message : String(error) });
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
      instrument: input.instrument,
      buy_date: input.buy_date,
      buy_price: input.buy_price,
      quantity: input.quantity,
      broker_label: input.broker_label,
      reason_text: input.reason_text,
      category_id: categoryId,
    })
    .select("id")
    .single();
  if (error) return failure(error);
  return { ok: true, id: data.id };
}
