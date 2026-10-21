import { z } from "astro/zod";
import { parseDecimal } from "@/lib/validation/decimal";
import { isUuid } from "@/lib/validation/uuid";
import {
  NEW_CATEGORY_CHOICE,
  POSITION_FORM_FIELDS,
  type NewPositionInput,
  type PositionFormErrors,
  type PositionFormField,
  type PositionFormValues,
} from "@/types";

export { parseDecimal };

export const NUMBER_MESSAGE = "Enter a number like 50.25";
export const POSITIVE_MESSAGE = "Must be greater than 0";

/** Today's date as `YYYY-MM-DD` in UTC — the server's reference for "not in the future". */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPositive(raw: string, ctx: z.RefinementCtx): string {
  const value = parseDecimal(raw);
  if (value === null) {
    ctx.addIssue({ code: "custom", message: NUMBER_MESSAGE });
    return z.NEVER;
  }
  if (value === "0") {
    ctx.addIssue({ code: "custom", message: POSITIVE_MESSAGE });
    return z.NEVER;
  }
  return value;
}

/** A required decimal field: `emptyMessage` when blank, else `parseDecimal` and greater than 0. */
export const requiredDecimal = (emptyMessage: string) =>
  z.string().transform((raw, ctx): string => {
    if (raw.trim() === "") {
      ctx.addIssue({ code: "custom", message: emptyMessage });
      return z.NEVER;
    }
    return toPositive(raw, ctx);
  });

const optionalDecimal = z.string().transform((raw, ctx) => (raw.trim() === "" ? null : toPositive(raw, ctx)));

function optionalText(max: number, message: string, trim: boolean) {
  return z
    .string()
    .transform((raw) => (trim ? raw.trim() : raw))
    .pipe(z.string().max(max, message))
    .transform((value) => (value.trim() === "" ? null : value));
}

/** True for a real `YYYY-MM-DD` calendar date (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const buyDate = z
  .string()
  .trim()
  .min(1, "Enter the buy date")
  .refine(isCalendarDate, "Enter a valid date")
  .refine((value) => value <= todayUtc(), "The buy date cannot be in the future");

const positionFormSchema = z
  .object({
    instrument: z.string().trim().min(1, "Enter the instrument").max(100, "Use at most 100 characters"),
    buy_price: requiredDecimal("Enter the buy price"),
    buy_date: buyDate,
    wallet_id: z.string().trim().min(1, "Choose a wallet").refine(isUuid, "Choose a wallet from your list"),
    // Checked together below: exactly one of the two must be given. The "New category…" choice
    // counts as no id, so the form also works without JS (the select then posts the sentinel).
    category_id: z
      .string()
      .trim()
      .transform((value) => (value === NEW_CATEGORY_CHOICE ? "" : value)),
    new_category_name: z.string().trim(),
    reason_text: optionalText(10_000, "Use at most 10,000 characters", false),
    quantity: optionalDecimal,
    broker_label: optionalText(60, "Use at most 60 characters", true),
  })
  .superRefine(
    ({ category_id, new_category_name }, ctx) => {
      if (category_id && new_category_name) {
        ctx.addIssue({
          code: "custom",
          path: ["category_id"],
          message: "Choose an existing category or type a new one, not both",
        });
      } else if (!category_id && !new_category_name) {
        ctx.addIssue({ code: "custom", path: ["category_id"], message: "Choose a category" });
      } else if (category_id && !isUuid(category_id)) {
        ctx.addIssue({ code: "custom", path: ["category_id"], message: "Choose a category from your list" });
      } else if (new_category_name.length > 60) {
        ctx.addIssue({ code: "custom", path: ["new_category_name"], message: "Use at most 60 characters" });
      }
    },
    // Run even when other fields failed, so the author sees every problem in one round trip.
    { when: () => true },
  )
  .transform(({ category_id, new_category_name, ...rest }): NewPositionInput => {
    return category_id
      ? { ...rest, category_id, new_category_name: null }
      : { ...rest, category_id: null, new_category_name };
  });

/** Reads the entry form's fields from a POST body; absent fields become empty strings. */
export function readPositionForm(form: FormData): PositionFormValues {
  const values = {} as PositionFormValues;
  for (const field of POSITION_FORM_FIELDS) {
    const value = form.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

export type ParsePositionResult =
  { success: true; data: NewPositionInput } | { success: false; errors: PositionFormErrors };

/** Parses raw form values into `NewPositionInput`, or returns the first message per field. */
export function parsePositionForm(values: PositionFormValues): ParsePositionResult {
  const result = positionFormSchema.safeParse(values);
  if (result.success) return { success: true, data: result.data };

  const errors: PositionFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    const key = (POSITION_FORM_FIELDS as readonly unknown[]).includes(field) ? (field as PositionFormField) : "form";
    errors[key] ??= issue.message;
  }
  return { success: false, errors };
}
