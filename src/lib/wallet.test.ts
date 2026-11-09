import { describe, expect, it } from "vitest";
import { describeWalletResults, groupByWallet, walletValue } from "@/lib/wallet";
import { formatAmount, formatPercent, formatSignedAmount } from "@/lib/format";
import type { WalletPosition } from "@/types";

const priced = (buy_price: string, current_price: string, quantity: string | null, price_date: string) => ({
  closing_commission: "0",
  sell_price: null,
  sell_date: null,
  opening_commission: "0",
  buy_price,
  current_price,
  quantity,
  price_date,
});
// Observe the public display contract; every expected string below is independently hand computed.
function displayed(result: ReturnType<typeof walletValue>) {
  return {
    ...(({ realisedChange: _r, openChange: _o, ...rest }) => rest)(result),
    value: formatAmount(result.value),
    change: formatSignedAmount(result.change),
    changePercent: result.changePercent === null ? null : formatPercent(result.changePercent),
  };
}

describe("walletValue", () => {
  it("is the starting value when the wallet has no positions", () => {
    expect(displayed(walletValue({ starting_value: "1000" }, []))).toEqual({
      value: "1,000.00",
      change: "0.00",
      changePercent: "0.00%",
      counted: 0,
      realisedCount: 0,
      openCount: 0,
      notCounted: 0,
      asOf: null,
    });
  });
  it("adds a gain of 100 to 1000", () => {
    expect(displayed(walletValue({ starting_value: "1000" }, [priced("50", "60", "10", "2026-10-01")]))).toEqual({
      value: "1,100.00",
      change: "+100.00",
      changePercent: "+10.00%",
      counted: 1,
      realisedCount: 0,
      openCount: 1,
      notCounted: 0,
      asOf: "2026-10-01",
    });
  });
  it("nets a loss against a gain and reports the oldest price date", () => {
    // -40 + 20 = -20; 1000 - 20 = 980; -2%.
    const result = walletValue({ starting_value: "1000" }, [
      priced("100", "80", "2", "2026-10-01"),
      priced("10", "15", "4", "2026-09-15"),
    ]);
    expect(displayed(result)).toEqual({
      value: "980.00",
      change: "-20.00",
      changePercent: "-2.00%",
      counted: 2,
      realisedCount: 0,
      openCount: 2,
      notCounted: 0,
      asOf: "2026-09-15",
    });
  });
  it("reports the oldest date regardless of input order", () => {
    expect(
      walletValue({ starting_value: "0" }, [
        priced("10", "15", "4", "2026-09-15"),
        priced("100", "80", "2", "2026-10-01"),
      ]).asOf,
    ).toBe("2026-09-15");
  });
  it("excludes a position without quantity", () => {
    expect(displayed(walletValue({ starting_value: "500" }, [priced("50", "60", null, "2026-10-01")]))).toMatchObject({
      value: "500.00",
      change: "0.00",
      counted: 0,
      notCounted: 1,
      asOf: null,
    });
  });
  it("excludes a position without a price", () => {
    expect(
      displayed(
        walletValue({ starting_value: "500" }, [
          {
            closing_commission: "0",
            sell_price: null,
            sell_date: null,
            opening_commission: "0",
            buy_price: "50",
            quantity: "10",
            current_price: null,
            price_date: null,
          },
        ]),
      ),
    ).toMatchObject({ value: "500.00", change: "0.00", counted: 0, notCounted: 1, asOf: null });
  });
  it("takes the oldest date from counted positions only", () => {
    expect(
      displayed(
        walletValue({ starting_value: "0" }, [
          priced("10", "12", null, "2026-01-01"),
          priced("10", "12", "5", "2026-10-01"),
        ]),
      ),
    ).toMatchObject({ change: "+10.00", counted: 1, notCounted: 1, asOf: "2026-10-01" });
  });
  it("has no percentage when the starting value is zero", () => {
    expect(displayed(walletValue({ starting_value: "0" }, [priced("10", "12", "5", "2026-10-01")]))).toMatchObject({
      value: "10.00",
      change: "+10.00",
      changePercent: null,
    });
  });
  it("sums decimals exactly rather than to a tolerance", () => {
    // (0.3 - 0.1) * 3 = 0.6 twice = 1.2.
    const result = walletValue({ starting_value: "100" }, [
      priced("0.1", "0.3", "3", "2026-10-01"),
      priced("0.1", "0.3", "3", "2026-10-01"),
    ]);
    expect(result.change).toEqual({ units: 12_000_000_000_000_000n, scale: 16 });
    expect(result.value).toEqual({ units: 1_012_000_000_000_000_000n, scale: 16 });
  });
  it("rounds only after summing sub-cent results", () => {
    const result = walletValue({ starting_value: "1" }, [
      priced("1", "1.004", "1", "2026-10-01"),
      priced("1", "1.004", "1", "2026-10-01"),
    ]);
    expect(result.change).toEqual({ units: 80_000_000_000_000n, scale: 16 });
    expect(displayed(result)).toMatchObject({ value: "1.01", change: "+0.01", changePercent: "+0.80%" });
  });
  it("retains low digits after cancellation of very large products", () => {
    const result = walletValue({ starting_value: "0" }, [
      priced("0.00000001", "999999999999.99999999", "999999999999.99999999", "2026-10-01"),
      priced("999999999999.99999999", "0.00000001", "999999999999.99999999", "2026-10-01"),
      priced("0.00000001", "0.00000002", "0.00000001", "2026-10-01"),
    ]);
    expect(result.change).toEqual({ units: 1n, scale: 16 });
  });
  it("does not cap totals at the input column range", () => {
    const result = walletValue({ starting_value: "999999999999.99999999" }, [priced("1", "2", "1", "2026-10-01")]);
    expect(formatAmount(result.value)).toBe("1,000,000,000,001.00");
  });
});

describe("groupByWallet", () => {
  it("groups by id while keeping input order", () => {
    const one: WalletPosition = {
      wallet_id: "w1",
      closing_commission: "0",
      sell_price: null,
      sell_date: null,
      opening_commission: "0",
      buy_price: "1",
      quantity: "1",
      current_price: null,
      price_date: null,
    };
    const two: WalletPosition = { ...one, wallet_id: "w2", opening_commission: "0", buy_price: "2" };
    const three: WalletPosition = { ...one, opening_commission: "0", buy_price: "3" };
    const groups = groupByWallet([one, two, three]);
    expect(groups.get("w1")).toEqual([one, three]);
    expect(groups.get("w2")).toEqual([two]);
    expect(groups.get("w3")).toBeUndefined();
  });
});

describe("realised wallet results", () => {
  const sold = {
    opening_commission: "0",
    buy_price: "50",
    quantity: "10",
    current_price: "999",
    price_date: "2026-10-20",
    closing_commission: "0",
    sell_price: "60",
    sell_date: "2026-01-01",
  };
  it("adds realised 100 and open 40 while dating only the open quote", () => {
    const result = walletValue({ starting_value: "1000" }, [sold, priced("10", "12", "20", "2026-10-01")]);
    expect(displayed(result)).toEqual({
      value: "1,140.00",
      change: "+140.00",
      changePercent: "+14.00%",
      counted: 2,
      realisedCount: 1,
      openCount: 1,
      notCounted: 0,
      asOf: "2026-10-01",
    });
    expect(describeWalletResults(result)).toBe("Open prices as of Oct 1, 2026 · Includes realised gains/losses");
    expect(displayed(walletValue({ starting_value: "1000" }, [priced("10", "12", "20", "2026-10-01")])).value).toBe(
      "1,040.00",
    );
  });
  it("counts closed positions without quotes and excludes missing quantities", () => {
    const result = walletValue({ starting_value: "1000" }, [
      { ...sold, current_price: null, price_date: null },
      { ...sold, quantity: null },
      priced("10", "12", null, "2025-01-01"),
    ]);
    expect(displayed(result)).toEqual({
      value: "1,100.00",
      change: "+100.00",
      changePercent: "+10.00%",
      counted: 1,
      realisedCount: 1,
      openCount: 0,
      notCounted: 2,
      asOf: null,
    });
    expect(describeWalletResults(result)).toBe("Realised results only");
  });
  it("includes total losses and does not invent empty freshness or a zero-start percentage", () => {
    const result = walletValue({ starting_value: "0" }, [{ ...sold, closing_commission: "0", sell_price: "0" }]);
    expect(displayed(result)).toMatchObject({
      value: "-500.00",
      change: "-500.00",
      changePercent: null,
      counted: 1,
      asOf: null,
    });
    expect(describeWalletResults(walletValue({ starting_value: "0" }, []))).toBe("No counted results");
  });
});

it("keeps realised and open breakdown exact", () => {
  const value = walletValue({ starting_value: "1000" }, [
    { ...priced("50", "999", "10", "2026-10-01"), closing_commission: "0", sell_price: "60", sell_date: "2026-02-01" },
    priced("10", "12", "20", "2026-10-01"),
  ]);
  expect(value.realisedChange).toEqual({ units: 1000000000000000000n, scale: 16 });
  expect(value.openChange).toEqual({ units: 400000000000000000n, scale: 16 });
});

it("deducts paid opening fees before a quote without inventing valuation coverage", () => {
  const holding = {
    ...priced("100", "110", "10", "2026-10-01"),
    opening_commission: "5",
    current_price: null,
    price_date: null,
  };
  const unpriced = walletValue({ starting_value: "1000" }, [holding]);
  expect(formatAmount(unpriced.value)).toBe("995.00");
  expect(formatSignedAmount(unpriced.openChange)).toBe("-5.00");
  expect(unpriced).toMatchObject({ counted: 0, openCount: 0, notCounted: 1, asOf: null });
  expect(describeWalletResults(unpriced)).toContain("commissions included");
  const quoted = walletValue({ starting_value: "1000" }, [
    { ...holding, current_price: "110", price_date: "2026-10-01" },
  ]);
  expect(formatAmount(quoted.value)).toBe("1,095.00");
  expect(quoted).toMatchObject({ counted: 1, openCount: 1, notCounted: 0 });
  expect(formatAmount(walletValue({ starting_value: "1000" }, []).value)).toBe("1,000.00");
});

it("does not describe a wallet with unpriced paid fees as realised results only", () => {
  const result = walletValue({ starting_value: "1000" }, [
    { ...priced("100", "110", "10", "2026-10-01"), sell_price: "110", sell_date: "2026-10-01" },
    { ...priced("100", "110", "10", "2026-10-01"), opening_commission: "5", current_price: null, price_date: null },
  ]);
  expect(result).toMatchObject({ realisedCount: 1, openCount: 0, notCounted: 1, asOf: null });
  expect(formatAmount(result.value)).toBe("1,095.00");
  expect(describeWalletResults(result)).toBe(
    "Realised results and paid opening commissions · Open position valuations incomplete",
  );
});
