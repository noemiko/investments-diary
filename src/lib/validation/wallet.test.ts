import { describe, expect, it } from "vitest";
import { parseWalletForm, readWalletForm } from "@/lib/validation/wallet";
describe("wallet form", () => {
  it("trims names and accepts localized starting values without attestation", () => {
    expect(parseWalletForm({ currency: "USD", name: " Retirement ", starting_value: "1 000,50" })).toEqual({
      success: true,
      data: { currency: "USD", name: "Retirement", starting_value: "1000.5" },
    });
  });
  it("allows zero and normal USD/PLN/EUR currency choices", () => {
    for (const currency of ["USD", "PLN", "EUR"] as const)
      expect(parseWalletForm({ currency, name: "Main", starting_value: "0" })).toEqual({
        success: true,
        data: { currency, name: "Main", starting_value: "0" },
      });
  });
  it.each(["", "-1", "1000000000000", "1.123456789", "Infinity", "NaN"])(
    "rejects invalid starting value %j",
    (starting_value) => {
      const result = parseWalletForm({ currency: "USD", name: "Main", starting_value });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errors.starting_value).toBeTruthy();
    },
  );
  it.each([" ", "a".repeat(61)])("rejects invalid name %j", (name) => {
    const result = parseWalletForm({ currency: "USD", name, starting_value: "0" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.name).toBeTruthy();
  });
  it("accepts maximum name and amount precision", () => {
    expect(parseWalletForm({ currency: "USD", name: "a".repeat(60), starting_value: "0.12345678" }).success).toBe(true);
  });
  it("reads only the three editable fields", () => {
    expect(readWalletForm(new FormData())).toEqual({ name: "", starting_value: "", currency: "" });
  });
  it.each(["", "GBP"])("rejects unsupported or missing new-wallet currency %j", (currency) => {
    const result = parseWalletForm({ currency, name: "Main", starting_value: "0" });
    expect(result).toMatchObject({ success: false, errors: { currency: "Choose USD, PLN or EUR" } });
  });
  it("keeps the existing wallet currency fixed during ordinary edits", () => {
    const values = { name: "Main", starting_value: "10", currency: "" };
    expect(parseWalletForm(values, { fixedCurrency: "USD" })).toEqual({
      success: true,
      data: { ...values, currency: "USD" },
    });
    expect(parseWalletForm({ ...values, currency: "EUR" }, { fixedCurrency: "USD" })).toMatchObject({
      success: false,
      errors: { currency: "Wallet currency cannot be changed" },
    });
  });
});
