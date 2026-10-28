import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyClosePositionForm, parseClosePositionForm, readClosePositionForm } from "@/lib/validation/close-position";
const valid = { sell_price: "60", sell_date: "2026-10-28", acknowledgement: "on" };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T23:45:00Z"));
});
afterEach(() => vi.useRealTimers());
it("defaults to UTC today with blank price and no acknowledgement", () => {
  expect(emptyClosePositionForm()).toEqual({ sell_price: "", sell_date: "2026-10-28", acknowledgement: "" });
  expect(readClosePositionForm(new FormData())).toEqual({ sell_price: "", sell_date: "", acknowledgement: "" });
});
it.each([
  ["0", "0"],
  ["0,00000001", "0.00000001"],
  ["999 999 999 999,99999999", "999999999999.99999999"],
])("accepts %s exactly", (raw, expected) => {
  expect(parseClosePositionForm({ ...valid, sell_price: raw }, "2026-10-28")).toEqual({
    success: true,
    data: { sell_price: expected, sell_date: "2026-10-28" },
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
    data: { sell_price: "60", sell_date: "2026-01-01" },
  });
});
