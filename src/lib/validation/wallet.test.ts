import { describe, expect, it } from "vitest";
import { parseWalletForm, readWalletForm } from "@/lib/validation/wallet";

describe("wallet form", () => {
  it("trims names and accepts localized starting values", () => {
    expect(parseWalletForm({ name: " Retirement ", starting_value: "1 000,50" })).toEqual({
      success: true,
      data: { name: "Retirement", starting_value: 1000.5 },
    });
  });

  it("allows a starting value of zero", () => {
    expect(parseWalletForm({ name: "Main", starting_value: "0" })).toEqual({
      success: true,
      data: { name: "Main", starting_value: 0 },
    });
  });

  it.each(["", "-1", "1000000000000", "1.123456789", "Infinity", "NaN"])(
    "rejects invalid starting value %j",
    (starting_value) => {
      const result = parseWalletForm({ name: "Main", starting_value });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errors.starting_value).toBeTruthy();
    },
  );

  it.each([" ", "a".repeat(61)])("rejects invalid name %j", (name) => {
    const result = parseWalletForm({ name, starting_value: "0" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.name).toBeTruthy();
  });

  it("accepts the maximum name length and numeric precision", () => {
    expect(parseWalletForm({ name: "a".repeat(60), starting_value: "0.12345678" }).success).toBe(true);
  });

  it("turns absent fields into editable empty strings", () => {
    expect(readWalletForm(new FormData())).toEqual({ name: "", starting_value: "" });
  });
});
