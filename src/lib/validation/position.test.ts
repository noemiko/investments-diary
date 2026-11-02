import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePositionForm, readPositionForm } from "@/lib/validation/position";
import { parsePriceForm } from "@/lib/validation/price";
import type { PositionFormValues } from "@/types";

const valid: PositionFormValues = {
  instrument: "Exact",
  listing_receipt_id: "00000000-0000-4000-8000-000000000003",
  listing_query: "Exact",
  buy_price: "50",
  buy_date: "2026-10-01",
  quantity: "",
  wallet_id: "00000000-0000-4000-8000-000000000001",
  category_id: "00000000-0000-4000-8000-000000000002",
  new_category_name: "",
  broker_label: "",
  reason_text: "",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T00:30:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("required stock selection", () => {
  it.each(["", "AAPL", "not-an-id"])("rejects a typed label without a valid receipt %j", (listing_receipt_id) => {
    expect(parsePositionForm({ ...valid, listing_receipt_id })).toMatchObject({
      success: false,
      errors: { listing_receipt_id: "Search and select a stock listing" },
    });
  });
  it("retains raw search and reasoning on POST but excludes the search query from the write input", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      ...valid,
      listing_query: "  Apple  ",
      reason_text: "Private reason",
    })) {
      form.set(key, value);
    }
    const values = readPositionForm(form);
    expect(values.listing_query).toBe("  Apple  ");
    expect(values.reason_text).toBe("Private reason");
    const result = parsePositionForm(values);
    expect(result).toMatchObject({ success: true, data: { listing_receipt_id: valid.listing_receipt_id } });
    if (result.success) expect(result.data).not.toHaveProperty("listing_query");
  });
});

describe("numeric form contracts", () => {
  it("preserves the maximum and optional quantity", () => {
    const result = parsePositionForm({ ...valid, buy_price: "999999999999,99999999", quantity: "0.00000001" });
    expect(result).toMatchObject({
      success: true,
      data: { buy_price: "999999999999.99999999", quantity: "0.00000001" },
    });
    expect(parsePositionForm(valid)).toMatchObject({ success: true, data: { quantity: null } });
  });
  it.each(["0", "0.00000000", "-1", "1 2", "1.123456789"])("rejects invalid positive field %j", (raw) => {
    for (const field of ["buy_price", "quantity"] as const) {
      const result = parsePositionForm({ ...valid, [field]: raw });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errors[field]).toBeTruthy();
    }
    expect(parsePriceForm({ current_price: raw, price_date: "2026-10-21" }, "2026-10-01").success).toBe(false);
  });
  it("keeps the existing positivity and syntax messages", () => {
    expect(parsePriceForm({ current_price: "0", price_date: "2026-10-21" }, valid.buy_date)).toMatchObject({
      success: false,
      errors: { current_price: "Must be greater than 0" },
    });
    expect(parsePriceForm({ current_price: "1 2", price_date: "2026-10-21" }, valid.buy_date)).toMatchObject({
      success: false,
      errors: { current_price: "Enter a number like 50.25" },
    });
  });
});

describe("calendar and price date contracts", () => {
  it.each(["2026-10-21", "2024-02-29"])("accepts valid buy date %s", (buy_date) => {
    expect(parsePositionForm({ ...valid, buy_date }).success).toBe(true);
  });
  it.each(["2026-10-22", "2026-02-29", "2026-02-30", "2026-13-01", "2026-2-1", ""])(
    "rejects buy date %j",
    (buy_date) => {
      expect(parsePositionForm({ ...valid, buy_date }).success).toBe(false);
    },
  );
  it.each(["2026-10-01", "2026-10-21"])("accepts price date %s including purchase and today", (price_date) => {
    expect(parsePriceForm({ current_price: "1,00000001", price_date }, valid.buy_date)).toEqual({
      success: true,
      data: { current_price: "1.00000001", price_date },
    });
  });
  it.each(["2026-09-30", "2026-10-22", "2026-02-30", ""])("rejects price date %j", (price_date) => {
    expect(parsePriceForm({ current_price: "1", price_date }, valid.buy_date).success).toBe(false);
  });
});
