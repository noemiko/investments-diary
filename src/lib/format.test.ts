import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatDate,
  formatNumber,
  formatPercent,
  formatSignedAmount,
  formatTimestamp,
} from "@/lib/format";

describe("exact formatting", () => {
  it.each([
    ["999999999999.99999999", "999,999,999,999.99999999"],
    ["123456789012.12345678", "123,456,789,012.12345678"],
    ["0.00000001", "0.00000001"],
    ["1200.50000000", "1,200.5"],
    ["0", "0"],
  ])("formats %s without losing digits", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
  it("rounds amounts without overflowing the input range", () => {
    expect(formatAmount("999999999999.99999999")).toBe("1,000,000,000,000.00");
    expect(formatAmount("1.005")).toBe("1.01");
    expect(formatSignedAmount({ units: -10_050_000_000_000_000n, scale: 16 })).toBe("-1.01");
    expect(formatSignedAmount("1.005")).toBe("+1.01");
    expect(formatSignedAmount({ units: -49_000_000_000_000n, scale: 16 })).toBe("0.00");
  });
  it("rounds repeating fractions only once", () => {
    expect(formatPercent({ numerator: 1n, denominator: 3n })).toBe("+0.33%");
    // 1.004999... must not be rounded to 1.005 before formatting.
    expect(formatPercent({ numerator: 100499999n, denominator: 100000000n })).toBe("+1.00%");
  });
  it("formats date-only values in UTC and timestamps on the Warsaw calendar", () => {
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDate("2024-02-29")).toBe("Feb 29, 2024");
    expect(formatTimestamp("2026-10-01T23:30:00Z")).toBe("Oct 2, 2026");
  });
});
