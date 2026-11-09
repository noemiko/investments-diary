import { z } from "astro/zod";
import { parseDecimal } from "@/lib/validation/decimal";
import {
  commissionDecimal,
  isCalendarDate,
  NUMBER_MESSAGE,
  requiredDecimal,
  todayUtc,
} from "@/lib/validation/position";
import {
  CLOSE_POSITION_FORM_FIELDS,
  type ClosePositionFormErrors,
  type ClosePositionFormField,
  type ClosePositionFormValues,
  type ClosePositionInput,
} from "@/types";

/** Initial close form: a deliberate acknowledgement is required on every submission. */
export function emptyClosePositionForm(): ClosePositionFormValues {
  return { sell_price: "", sell_date: todayUtc(), closing_commission: "", quantity: "", acknowledgement: "" };
}

export function readClosePositionForm(form: FormData): ClosePositionFormValues {
  const values = {} as ClosePositionFormValues;
  for (const field of CLOSE_POSITION_FORM_FIELDS) {
    const value = form.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

function closePositionSchema(buyDate: string, savedQuantity: string | null) {
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
      closing_commission: commissionDecimal,
      quantity: z.string().transform((raw, ctx) => {
        if (savedQuantity !== null || raw.trim() === "") return undefined;
        const parsed = requiredDecimal("Enter quantity").safeParse(raw);
        if (!parsed.success) {
          ctx.addIssue({ code: "custom", message: parsed.error.issues[0].message });
          return z.NEVER;
        }
        return parsed.data;
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
    .superRefine(({ closing_commission, quantity }, ctx) => {
      if (closing_commission !== "0" && savedQuantity === null && quantity === undefined) {
        ctx.addIssue({ code: "custom", path: ["quantity"], message: "Enter quantity to record a commission" });
      }
    })
    .transform(({ sell_price, sell_date, closing_commission, quantity }): ClosePositionInput => ({
      sell_price,
      sell_date,
      closing_commission,
      ...(quantity === undefined ? {} : { quantity }),
    }));
}

export type ParseClosePositionResult =
  { success: true; data: ClosePositionInput } | { success: false; errors: ClosePositionFormErrors };

export function parseClosePositionForm(
  values: ClosePositionFormValues,
  buyDate: string,
  savedQuantity: string | null = null,
): ParseClosePositionResult {
  const result = closePositionSchema(buyDate, savedQuantity).safeParse(values);
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
