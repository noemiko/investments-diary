import { z } from "astro/zod";
import { NUMBER_MESSAGE, parseDecimal } from "@/lib/validation/position";
import {
  WALLET_FORM_FIELDS,
  type WalletFormErrors,
  type WalletFormField,
  type WalletFormValues,
  type WalletInput,
} from "@/types";

// Unlike a price, a starting value may be 0 (a wallet that only tracks results), so this does not
// reuse `requiredDecimal`, which rejects 0.
const startingValue = z.string().transform((raw, ctx): string => {
  if (raw.trim() === "") {
    ctx.addIssue({ code: "custom", message: "Enter the starting value" });
    return z.NEVER;
  }
  const value = parseDecimal(raw);
  if (value === null) {
    ctx.addIssue({ code: "custom", message: NUMBER_MESSAGE });
    return z.NEVER;
  }
  return value;
});

const walletFormSchema = z.object({
  name: z.string().trim().min(1, "Name the wallet").max(60, "Use at most 60 characters"),
  starting_value: startingValue,
});

/** Reads the wallet form's fields from a POST body; absent fields become empty strings. */
export function readWalletForm(form: FormData): WalletFormValues {
  const values = {} as WalletFormValues;
  for (const field of WALLET_FORM_FIELDS) {
    const value = form.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

export type ParseWalletResult = { success: true; data: WalletInput } | { success: false; errors: WalletFormErrors };

/** Parses raw wallet-form values into `WalletInput`, or returns the first message per field. */
export function parseWalletForm(values: WalletFormValues): ParseWalletResult {
  const result = walletFormSchema.safeParse(values);
  if (result.success) return { success: true, data: result.data };

  const errors: WalletFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    const key = (WALLET_FORM_FIELDS as readonly unknown[]).includes(field) ? (field as WalletFormField) : "form";
    errors[key] ??= issue.message;
  }
  return { success: false, errors };
}
