import type { PostgrestError } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase";
import type { NewPositionInput, PositionListItem, ReasonCategory } from "@/types";

// Always the request-scoped client, so RLS scopes every query to the signed-in author.
type Client = ReturnType<typeof createClient>;

export type CreatePositionError = "validation" | "category_not_found" | "unexpected";

export type CreatePositionResult = { ok: true; id: string } | { ok: false; error: CreatePositionError };

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
    .select("id, instrument, buy_date, buy_price, quantity, broker_label, reason_categories(name)")
    .is("deleted_at", null)
    .order("buy_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPositions failed: ${error.message}`);
  return data.map(({ reason_categories, ...position }) => ({
    ...position,
    category_name: reason_categories.name,
  }));
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
