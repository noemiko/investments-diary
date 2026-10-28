import { z } from "astro/zod";
import { parseDecimal } from "@/lib/validation/decimal";
import { isCalendarDate, NUMBER_MESSAGE, todayUtc } from "@/lib/validation/position";
import {
  CLOSE_POSITION_FORM_FIELDS,
  type ClosePositionFormErrors,
  type ClosePositionFormField,
  type ClosePositionFormValues,
  type ClosePositionInput,
} from "@/types";

/** Initial close form: a deliberate acknowledgement is required on every submission. */
export function emptyClosePositionForm(): ClosePositionFormValues {
  return { sell_price: "", sell_date: todayUtc(), acknowledgement: "" };
}

export function readClosePositionForm(form: FormData): ClosePositionFormValues {
  const values = {} as ClosePositionFormValues;
  for (const field of CLOSE_POSITION_FORM_FIELDS) {
    const value = form.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

function closePositionSchema(buyDate: string) {
  return z
    .object({
      sell_price: z.string().transform((raw, ctx) => {
        const value = parseDecimal(raw);
        if (value === null) {
          ctx.addIssue({ code: "custom", message: raw.trim() ? NUMBER_MESSAGE : "Enter the sell price" });
          return z.NEVER;
        }
        return value;
      }),
      sell_date: z
        .string()
        .trim()
        .min(1, "Enter the sell date")
        .refine(isCalendarDate, "Enter a valid date")
        .refine((value) => value <= todayUtc(), "The sell date cannot be in the future")
        .refine((value) => value >= buyDate, "The sell date cannot be before the buy date"),
      acknowledgement: z.literal("on", { error: "Confirm that you are closing the entire position" }),
    })
    .transform(({ sell_price, sell_date }): ClosePositionInput => ({ sell_price, sell_date }));
}

export type ParseClosePositionResult =
  { success: true; data: ClosePositionInput } | { success: false; errors: ClosePositionFormErrors };

export function parseClosePositionForm(values: ClosePositionFormValues, buyDate: string): ParseClosePositionResult {
  const result = closePositionSchema(buyDate).safeParse(values);
  if (result.success) return { success: true, data: result.data };
  const errors: ClosePositionFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    const key = (CLOSE_POSITION_FORM_FIELDS as readonly unknown[]).includes(field)
      ? (field as ClosePositionFormField)
      : "form";
    errors[key] ??= issue.message;
  }
  return { success: false, errors };
}
