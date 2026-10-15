import { z } from "astro/zod";
import { isCalendarDate, requiredDecimal, todayUtc } from "@/lib/validation/position";
import {
  PRICE_FORM_FIELDS,
  type PriceFormErrors,
  type PriceFormField,
  type PriceFormValues,
  type PriceUpdateInput,
} from "@/types";

function priceFormSchema(buyDate: string) {
  return z.object({
    current_price: requiredDecimal("Enter the current price"),
    price_date: z
      .string()
      .trim()
      .min(1, "Enter the price date")
      .refine(isCalendarDate, "Enter a valid date")
      .refine((value) => value <= todayUtc(), "The price date cannot be in the future")
      .refine((value) => value >= buyDate, "The price date cannot be before the buy date"),
  });
}

/** Reads the price form's fields from a POST body; absent fields become empty strings. */
export function readPriceForm(form: FormData): PriceFormValues {
  const values = {} as PriceFormValues;
  for (const field of PRICE_FORM_FIELDS) {
    const value = form.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

export type ParsePriceResult = { success: true; data: PriceUpdateInput } | { success: false; errors: PriceFormErrors };

/** Parses raw price-form values against the position's buy date, or returns the first message per field. */
export function parsePriceForm(values: PriceFormValues, buyDate: string): ParsePriceResult {
  const result = priceFormSchema(buyDate).safeParse(values);
  if (result.success) return { success: true, data: result.data };

  const errors: PriceFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    const key = (PRICE_FORM_FIELDS as readonly unknown[]).includes(field) ? (field as PriceFormField) : "form";
    errors[key] ??= issue.message;
  }
  return { success: false, errors };
}
