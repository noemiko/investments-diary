import { describe, expect, it } from "vitest";
import { parseWalletForm, readWalletForm } from "@/lib/validation/wallet";

describe("wallet form", () => {
  it("trims names and accepts localized starting values", () => {
    expect(
      parseWalletForm({ currency: "USD", currency_attested: "on", name: " Retirement ", starting_value: "1 000,50" }),
    ).toEqual({
      success: true,
      data: { currency: "USD", currency_attested: true, name: "Retirement", starting_value: "1000.5" },
    });
  });

  it("allows a starting value of zero", () => {
    expect(parseWalletForm({ currency: "USD", currency_attested: "on", name: "Main", starting_value: "0" })).toEqual({
      success: true,
      data: { currency: "USD", currency_attested: true, name: "Main", starting_value: "0" },
    });
  });

  it.each(["", "-1", "1000000000000", "1.123456789", "Infinity", "NaN"])(
    "rejects invalid starting value %j",
    (starting_value) => {
      const result = parseWalletForm({ currency: "USD", currency_attested: "on", name: "Main", starting_value });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errors.starting_value).toBeTruthy();
    },
  );

  it.each([" ", "a".repeat(61)])("rejects invalid name %j", (name) => {
    const result = parseWalletForm({ currency: "USD", currency_attested: "on", name, starting_value: "0" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.name).toBeTruthy();
  });

  it("accepts the maximum name length and numeric precision", () => {
    expect(
      parseWalletForm({ currency: "USD", currency_attested: "on", name: "a".repeat(60), starting_value: "0.12345678" })
        .success,
    ).toBe(true);
  });

  it("turns absent fields into editable empty strings", () => {
    expect(readWalletForm(new FormData())).toEqual({
      name: "",
      starting_value: "",
      currency: "",
      currency_attested: "",
    });
  });
  it("requires currency and explicit attestation for new wallets", () => {
    for (const [currency, currency_attested] of [
      ["", ""],
      ["GBP", "on"],
      ["EUR", ""],
    ]) {
      expect(parseWalletForm({ name: "Main", starting_value: "0", currency, currency_attested }).success).toBe(false);
    }
    expect(
      parseWalletForm({ name: "Main", starting_value: "0", currency: "EUR", currency_attested: "on" }),
    ).toMatchObject({ success: true, data: { currency: "EUR", currency_attested: true } });
  });

  it("keeps legacy wallets unconfirmed during ordinary edits and freezes confirmed currencies", () => {
    const values = { name: "Legacy", starting_value: "10", currency: "", currency_attested: "" };
    expect(parseWalletForm(values, { editing: true })).toMatchObject({
      success: true,
      data: { currency: null, currency_attested: false },
    });
    expect(parseWalletForm(values, { editing: true, confirmedCurrency: "PLN" })).toMatchObject({
      success: true,
      data: { currency: "PLN", currency_attested: true },
    });
    expect(
      parseWalletForm(
        { ...values, currency: "EUR", currency_attested: "on" },
        { editing: true, confirmedCurrency: "PLN" },
      ).success,
    ).toBe(false);
  });
});
