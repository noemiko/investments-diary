import type { Tables } from "@/db/database.types";

type CategoryRow = Tables<"reason_categories">;
type PositionRow = Tables<"positions">;

/** A reason category the author can file a position under (FR-005). */
export type ReasonCategory = Pick<CategoryRow, "id" | "name">;

/** One row of the positions list on the dashboard (FR-010). */
export type PositionListItem = Pick<
  PositionRow,
  "id" | "instrument" | "buy_date" | "buy_price" | "quantity" | "broker_label"
> & {
  category_name: string;
};

/** The entry form after parsing: exactly one of `category_id` / `new_category_name` is set. */
export type NewPositionInput = Pick<
  PositionRow,
  "instrument" | "buy_date" | "buy_price" | "quantity" | "broker_label" | "reason_text"
> &
  ({ category_id: string; new_category_name: null } | { category_id: null; new_category_name: string });

export const POSITION_FORM_FIELDS = [
  "instrument",
  "buy_price",
  "buy_date",
  "category_id",
  "new_category_name",
  "reason_text",
  "quantity",
  "broker_label",
] as const;

export type PositionFormField = (typeof POSITION_FORM_FIELDS)[number];

/** The `category_id` value of the "New category…" choice: the name comes from `new_category_name` instead. */
export const NEW_CATEGORY_CHOICE = "__new__";

/** Raw form values as submitted, echoed back into the form when a submission is rejected. */
export type PositionFormValues = Record<PositionFormField, string>;

/** One message per field; `form` carries errors that belong to no single field. */
export type PositionFormErrors = Partial<Record<PositionFormField | "form", string>>;
