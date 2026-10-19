import { describe, expect, it } from "vitest";
import { groupByWallet, walletValue } from "@/lib/wallet";
import type { WalletPosition } from "@/types";

// Every expected value is computed by hand in the comment beside it, never with the formula under
// test (test-plan §3 Phase 1).

const priced = (buy_price: number, current_price: number, quantity: number | null, price_date: string) => ({
  buy_price,
  current_price,
  quantity,
  price_date,
});

describe("walletValue", () => {
  it("is the starting value when the wallet has no positions", () => {
    expect(walletValue({ starting_value: 1000 }, [])).toEqual({
      value: 1000,
      change: 0,
      changePercent: 0,
      counted: 0,
      notCounted: 0,
      asOf: null,
    });
  });

  it("adds a gain: (60 − 50) × 10 = +100 on 1000", () => {
    expect(walletValue({ starting_value: 1000 }, [priced(50, 60, 10, "2026-10-01")])).toEqual({
      value: 1100,
      change: 100,
      changePercent: 10, // 100 / 1000 × 100
      counted: 1,
      notCounted: 0,
      asOf: "2026-10-01",
    });
  });

  it("nets a loss against a gain and reports the oldest price date", () => {
    const result = walletValue({ starting_value: 1000 }, [
      priced(100, 80, 2, "2026-10-01"), // (80 − 100) × 2 = −40
      priced(10, 15, 4, "2026-09-15"), // (15 − 10) × 4 = +20
    ]);
    expect(result).toEqual({
      value: 980, // 1000 − 40 + 20
      change: -20,
      changePercent: -2, // −20 / 1000 × 100
      counted: 2,
      notCounted: 0,
      asOf: "2026-09-15",
    });
  });

  it("reports the oldest price date whatever order the positions come in", () => {
    const result = walletValue({ starting_value: 0 }, [
      priced(10, 15, 4, "2026-09-15"), // oldest first this time
      priced(100, 80, 2, "2026-10-01"),
    ]);
    expect(result.asOf).toBe("2026-09-15");
  });

  it("leaves out a position without a quantity and counts it as not counted", () => {
    const result = walletValue({ starting_value: 500 }, [priced(50, 60, null, "2026-10-01")]);
    expect(result).toMatchObject({ value: 500, change: 0, counted: 0, notCounted: 1, asOf: null });
  });

  it("leaves out a position without a current price and counts it as not counted", () => {
    const result = walletValue({ starting_value: 500 }, [
      { buy_price: 50, current_price: null, quantity: 10, price_date: null },
    ]);
    expect(result).toMatchObject({ value: 500, change: 0, counted: 0, notCounted: 1, asOf: null });
  });

  it("takes the oldest date from counted positions only", () => {
    const result = walletValue({ starting_value: 0 }, [
      priced(10, 12, null, "2026-01-01"), // not counted: its older date must not become asOf
      priced(10, 12, 5, "2026-10-01"), // (12 − 10) × 5 = +10
    ]);
    expect(result).toMatchObject({ change: 10, counted: 1, notCounted: 1, asOf: "2026-10-01" });
  });

  it("has no change percentage when the starting value is 0", () => {
    const result = walletValue({ starting_value: 0 }, [priced(10, 12, 5, "2026-10-01")]);
    expect(result).toMatchObject({ value: 10, change: 10, changePercent: null });
  });

  it("sums decimal prices to within display precision", () => {
    // (0.3 − 0.1) × 3 = 0.6, twice = 1.2; floats drift in the last digits, so compare to 8 places.
    const result = walletValue({ starting_value: 100 }, [
      priced(0.1, 0.3, 3, "2026-10-01"),
      priced(0.1, 0.3, 3, "2026-10-01"),
    ]);
    expect(result.change).toBeCloseTo(1.2, 8);
    expect(result.value).toBeCloseTo(101.2, 8);
  });
});

describe("groupByWallet", () => {
  it("groups positions by wallet id, keeping their order", () => {
    const one: WalletPosition = { wallet_id: "w1", buy_price: 1, quantity: 1, current_price: null, price_date: null };
    const two: WalletPosition = { ...one, wallet_id: "w2", buy_price: 2 };
    const three: WalletPosition = { ...one, buy_price: 3 };
    const groups = groupByWallet([one, two, three]);
    expect(groups.get("w1")).toEqual([one, three]);
    expect(groups.get("w2")).toEqual([two]);
    expect(groups.get("w3")).toBeUndefined();
  });
});
