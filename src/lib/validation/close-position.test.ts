import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyClosePositionForm, parseClosePositionForm, readClosePositionForm } from "@/lib/validation/close-position";
const valid = {
  closing_commission: "0",
  sell_price: "60",
  sell_date: "2026-10-28",
  quantity: "",
  acknowledgement: "on",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T23:45:00Z"));
});
afterEach(() => vi.useRealTimers());
it("defaults to UTC today with blank price and no acknowledgement", () => {
  expect(emptyClosePositionForm()).toEqual({
    closing_commission: "",
    sell_price: "",
    sell_date: "2026-10-28",
    quantity: "",
    acknowledgement: "",
  });
  expect(readClosePositionForm(new FormData())).toEqual({
    closing_commission: "",
    sell_price: "",
    sell_date: "",
    quantity: "",
    acknowledgement: "",
  });
});
it.each([
  ["0", "0"],
  ["0,00000001", "0.00000001"],
  ["999 999 999 999,99999999", "999999999999.99999999"],
])("accepts %s exactly", (raw, expected) => {
  expect(parseClosePositionForm({ ...valid, sell_price: raw }, "2026-10-28")).toEqual({
    success: true,
    data: { closing_commission: "0", sell_price: expected, sell_date: "2026-10-28" },
  });
});
it.each(["", "-1", "1.000000001", "1000000000000", "1 2", "Infinity"])("rejects invalid sale %s", (sell_price) => {
  const result = parseClosePositionForm({ ...valid, sell_price }, "2026-01-01");
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Invalid form was accepted");
  expect(result.errors.sell_price).toBeTypeOf("string");
});
it.each(["2026-02-30", "2025-12-31", "2026-10-29", ""])("rejects invalid date %s", (sell_date) => {
  const result = parseClosePositionForm({ ...valid, sell_date }, "2026-01-01");
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Invalid form was accepted");
  expect(result.errors.sell_date).toBeTypeOf("string");
});
it.each(["", "false", "true"])("requires the checked acknowledgement (%s)", (acknowledgement) => {
  const result = parseClosePositionForm({ ...valid, acknowledgement }, "2026-01-01");
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Invalid form was accepted");
  expect(result.errors.acknowledgement).toBeTypeOf("string");
});
it("reads submitted values and permits a sale before a retained quote", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...valid, sell_date: "2026-01-01" })) form.set(key, value);
  expect(parseClosePositionForm(readClosePositionForm(form), "2026-01-01")).toEqual({
    success: true,
    data: { closing_commission: "0", sell_price: "60", sell_date: "2026-01-01" },
  });
});

it("completes legacy quantity only when missing and requires it for a nonzero fee", () => {
  expect(parseClosePositionForm({ ...valid, closing_commission: "7", quantity: "" }, "2026-01-01", null)).toMatchObject(
    { success: false, errors: { quantity: "Enter quantity to record a commission" } },
  );
  expect(
    parseClosePositionForm({ ...valid, closing_commission: "7,00000001", quantity: "0,25" }, "2026-01-01", null),
  ).toMatchObject({ success: true, data: { closing_commission: "7.00000001", quantity: "0.25" } });
  const existing = parseClosePositionForm({ ...valid, closing_commission: "7", quantity: "999" }, "2026-01-01", "10");
  expect(existing).toMatchObject({ success: true, data: { closing_commission: "7" } });
  if (existing.success) expect(existing.data).not.toHaveProperty("quantity");
});
it.each(["-1", "1.000000001", "1000000000000", "NaN"])(
  "rejects invalid closing commission %j",
  (closing_commission) => {
    expect(parseClosePositionForm({ ...valid, closing_commission }, "2026-01-01", "10")).toMatchObject({
      success: false,
      errors: { closing_commission: "Enter a number like 50.25" },
    });
  },
);
it.each(["0", "-1", "1.000000001"])("rejects invalid supplied missing quantity %j", (quantity) => {
  expect(parseClosePositionForm({ ...valid, closing_commission: "1", quantity }, "2026-01-01", null).success).toBe(
    false,
  );
});
