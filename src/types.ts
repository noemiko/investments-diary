import type { Tables } from "@/db/database.types";

type CategoryRow = Tables<"reason_categories">;
type PositionRow = Tables<"positions">;

/** A reason category the author can file a position under (FR-005). */
export type ReasonCategory = Pick<CategoryRow, "id" | "name">;

/** One row of the positions list on the dashboard (FR-010). */
export type PositionListItem = Pick<
  PositionRow,
  "id" | "instrument" | "buy_date" | "buy_price" | "quantity" | "broker_label" | "current_price" | "price_date"
> & {
  category_name: string;
};

/** One position on its detail page (FR-011): the list row plus the full reason. */
export type PositionDetail = PositionListItem & Pick<PositionRow, "reason_text">;

/** One earlier position as the confrontation panel shows it, grouped by `category_id` on the client. */
export type ConfrontationPosition = Pick<
  PositionRow,
  | "id"
  | "category_id"
  | "instrument"
  | "buy_date"
  | "buy_price"
  | "quantity"
  | "current_price"
  | "price_date"
  | "reason_text"
>;

/** One row of the Deleted positions page (FR-009): only rows that have a `deleted_at`. */
export type DeletedPositionItem = Pick<PositionRow, "id" | "instrument" | "buy_date" | "deleted_at"> & {
  deleted_at: string;
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

/** The price form after parsing (FR-006): both fields are required. */
export interface PriceUpdateInput {
  current_price: number;
  price_date: string;
}

export const PRICE_FORM_FIELDS = ["current_price", "price_date"] as const;

export type PriceFormField = (typeof PRICE_FORM_FIELDS)[number];

/** Raw price-form values as submitted, echoed back into the form when a submission is rejected. */
export type PriceFormValues = Record<PriceFormField, string>;

/** One message per field; `form` carries errors that belong to no single field. */
export type PriceFormErrors = Partial<Record<PriceFormField | "form", string>>;
