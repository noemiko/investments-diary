import { describe, expect, it } from "vitest";
import { canonicalDecimal, decimalUnits, readDecimal, roundedHundredths } from "@/lib/decimal";

describe("exact decimal primitives", () => {
  it("keeps the maximum and adjacent last digits distinct", () => {
    expect(decimalUnits("999999999999.99999999")).toBe(99_999_999_999_999_999_999n);
    expect(decimalUnits("999999999999.99999998")).toBe(99_999_999_999_999_999_998n);
    expect(decimalUnits("0.00000001")).toBe(1n);
    expect(canonicalDecimal("00012.34000000")).toBe("12.34");
    expect(canonicalDecimal("00.00000000")).toBe("0");
  });

  it.each([
    [10049n, 10000n, 100n],
    [10050n, 10000n, 101n],
    [10051n, 10000n, 101n],
    [-10049n, 10000n, -100n],
    [-10050n, 10000n, -101n],
    [-10051n, 10000n, -101n],
    [49n, 10000n, 0n],
    [-49n, 10000n, 0n],
    [50n, 10000n, 1n],
    [-50n, 10000n, -1n],
    [1n, 3n, 33n],
    [-1n, 3n, -33n],
  ])("rounds %s / %s to %s hundredths", (numerator, denominator, expected) => {
    expect(roundedHundredths({ numerator, denominator })).toBe(expected);
  });

  it.each([" 1", "1 ", "1000000000000", "1.123456789"])("rejects out-of-contract unit input %j", (value) => {
    expect(() => decimalUnits(value)).toThrow();
  });

  it("rejects negative denominators instead of computing a financial result", () => {
    expect(() => roundedHundredths({ numerator: 1n, denominator: -1n })).toThrow();
  });

  it("accepts database zero unless positivity is explicitly required", () => {
    expect(readDecimal("0")).toBe("0");
    expect(readDecimal("00.00000000")).toBe("0");
    expect(() => readDecimal("00.00000000", true)).toThrow();
  });

  it("rejects an invalid denominator and unsafe database responses", () => {
    expect(() => roundedHundredths({ numerator: 1n, denominator: 0n })).toThrow();
    for (const value of [1, null, undefined, "NaN", "1e2", "1,2", "-1", "1.123456789", "1000000000000"]) {
      expect(() => readDecimal(value)).toThrow();
    }
    expect(readDecimal("123456789012.12345678")).toBe("123456789012.12345678");
    expect(() => readDecimal("0", true)).toThrow();
  });
});
