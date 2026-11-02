import { describe, expect, it } from "vitest";
import { describeResult, positionResult, NO_PRICE, type PositionResultInput } from "@/lib/result";

const priced: PositionResultInput = {
  sell_price: null,
  sell_date: null,
  buy_price: "50",
  current_price: "60",
  quantity: "10",
  price_date: "2026-10-01",
};

describe("position result", () => {
  it("computes a gain and carries the price date", () => {
    expect(positionResult(priced)).toEqual({
      kind: "open",
      percent: { numerator: 100_000_000_000n, denominator: 5_000_000_000n },
      amount: { units: 1_000_000_000_000_000_000n, scale: 16 },
      priceDate: "2026-10-01",
    });
    expect(describeResult(priced)).toEqual({ percent: "+20.00%", asOf: "as of Oct 1, 2026", direction: "up" });
  });
  it("computes a loss with independent expectations", () => {
    const input = { ...priced, buy_price: "100", current_price: "80", quantity: "2" };
    expect(positionResult(input)?.amount).toEqual({ units: -400_000_000_000_000_000n, scale: 16 });
    expect(describeResult(input)?.percent).toBe("-20.00%");
  });
  it("shows unsigned zero for an unchanged price", () => {
    expect(describeResult({ ...priced, current_price: "50" })?.percent).toBe("0.00%");
  });
  it("keeps percent when quantity is absent", () => {
    expect(positionResult({ ...priced, quantity: null })?.amount).toBeNull();
    expect(describeResult({ ...priced, quantity: null })?.percent).toBe("+20.00%");
  });
  it.each([
    { current_price: null, price_date: null },
    { current_price: null, price_date: "2026-10-01" },
    { current_price: "60", price_date: null },
  ])("has no result for missing price or date: %j", (fields) => {
    expect(positionResult({ ...priced, ...fields })).toBeNull();
    expect(describeResult({ ...priced, ...fields })).toBeNull();
    expect(NO_PRICE).toBe("No price yet");
  });
  it("retains an eight-decimal price and quantity through multiplication", () => {
    const input = { ...priced, buy_price: "0.00000001", current_price: "0.00000002", quantity: "0.00000001" };
    expect(positionResult(input)?.amount).toEqual({ units: 1n, scale: 16 });
    expect(describeResult(input)?.percent).toBe("+100.00%");
  });
  it("distinguishes adjacent values at the upper bound", () => {
    const input = {
      ...priced,
      buy_price: "999999999999.99999998",
      current_price: "999999999999.99999999",
      quantity: "1",
    };
    expect(positionResult(input)?.amount).toEqual({ units: 100_000_000n, scale: 16 });
    expect(positionResult(input)?.percent.numerator).toBe(100n);
  });
  it.each([
    ["100.004999", "0.00%"],
    ["100.005", "+0.01%"],
    ["100.005001", "+0.01%"],
    ["99.995001", "0.00%"],
    ["99.995", "-0.01%"],
    ["99.994999", "-0.01%"],
  ])("rounds the exact percentage at price %s", (current_price, expected) => {
    expect(describeResult({ ...priced, buy_price: "100", current_price })?.percent).toBe(expected);
  });
});

describe("final sale results", () => {
  it("uses the sale pair over a different later quote", () => {
    const input = {
      ...priced,
      current_price: "80",
      price_date: "2026-10-10",
      sell_price: "60",
      sell_date: "2026-09-01",
    };
    expect(positionResult(input)).toEqual({
      kind: "closed",
      percent: { numerator: 100_000_000_000n, denominator: 5_000_000_000n },
      amount: { units: 1_000_000_000_000_000_000n, scale: 16 },
      priceDate: "2026-09-01",
    });
    expect(describeResult(input)).toEqual({ percent: "Final +20.00%", asOf: "· sold Sep 1, 2026", direction: "up" });
  });
  it("counts a zero sale as a total loss without any quote", () => {
    const input = { ...priced, current_price: null, price_date: null, sell_price: "0", sell_date: "2026-02-01" };
    expect(positionResult(input)?.amount).toEqual({ units: -5_000_000_000_000_000_000n, scale: 16 });
    expect(describeResult(input)).toEqual({ percent: "Final -100.00%", asOf: "· sold Feb 1, 2026", direction: "down" });
    expect(positionResult({ ...input, quantity: null })?.amount).toBeNull();
    expect(describeResult({ ...input, quantity: null })?.percent).toBe("Final -100.00%");
  });
  it.each([
    ["40", "Final -20.00%"],
    ["50", "Final 0.00%"],
    ["50.0025", "Final +0.01%"],
    ["49.9975", "Final -0.01%"],
  ])("keeps exact final display at %s", (sell_price, expected) => {
    expect(describeResult({ ...priced, sell_price, sell_date: "2026-01-01" })?.percent).toBe(expected);
  });
});

describe("result direction", () => {
  const closed = { sell_date: "2026-09-01" };
  it.each([
    { kind: "open", fields: { current_price: "60" }, direction: "up", percent: "+20.00%" },
    { kind: "open", fields: { current_price: "40" }, direction: "down", percent: "-20.00%" },
    { kind: "open", fields: { current_price: "50" }, direction: "flat", percent: "0.00%" },
    { kind: "closed", fields: { ...closed, sell_price: "60" }, direction: "up", percent: "Final +20.00%" },
    { kind: "closed", fields: { ...closed, sell_price: "40" }, direction: "down", percent: "Final -20.00%" },
    { kind: "closed", fields: { ...closed, sell_price: "50" }, direction: "flat", percent: "Final 0.00%" },
  ])("is $direction for an $kind result of $percent", ({ fields, direction, percent }) => {
    expect(describeResult({ ...priced, ...fields })).toMatchObject({ percent, direction });
  });
  it("uses the exact ratio, not the rounded text, so a tiny change is not flat", () => {
    const input = { ...priced, buy_price: "100" };
    expect(describeResult({ ...input, current_price: "100.004999" })).toMatchObject({
      percent: "0.00%",
      direction: "up",
    });
    expect(describeResult({ ...input, current_price: "99.995001" })).toMatchObject({
      percent: "0.00%",
      direction: "down",
    });
  });
  it("has no direction without a result, open or closed", () => {
    expect(describeResult({ ...priced, current_price: null, price_date: null })).toBeNull();
    expect(describeResult({ ...priced, sell_price: "60", sell_date: null, current_price: null })).toBeNull();
  });
});
