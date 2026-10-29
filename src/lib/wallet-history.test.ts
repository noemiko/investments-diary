import { expect, it } from "vitest";
import { aggregateAmount, aggregateUnits, historyGeometry, historyRange } from "./wallet-history";
import { formatAmount } from "./format";
import type { WalletSnapshot } from "@/types";
const point = (observation_day: string, value = "1140"): WalletSnapshot => ({
  wallet_id: "w",
  observation_day,
  captured_at: `${observation_day}T00:00:00Z`,
  value,
  starting_value: "1000",
  realised_change: "100",
  open_change: "40",
  realised_count: 1,
  open_count: 1,
  not_counted: 0,
  as_of: observation_day,
});
it("decodes signed unrestricted 16-place aggregates without losing digits", () => {
  expect(aggregateUnits("-1000000000000000000000000.0000000000000001")).toBe(
    -10000000000000000000000000000000000000001n,
  );
  expect(formatAmount(aggregateAmount("-1140.005"))).toBe("-1,140.01");
  for (const invalid of [1140, "NaN", "Infinity", "1e20", "1.00000000000000001"])
    expect(() => aggregateUnits(invalid)).toThrow();
});
it("uses inclusive rolling UTC boundaries, including leap day and excluding future points", () => {
  const points = [point("2024-02-29"), point("2024-03-01"), point("2024-03-29"), point("2024-03-30")];
  expect(historyRange(points, "30", "2024-03-29").map((p) => p.observation_day)).toEqual([
    "2024-02-29",
    "2024-03-01",
    "2024-03-29",
  ]);
  expect(historyRange(points, "all", "2024-03-29")).toHaveLength(3);
});
it("breaks missing days and keeps zero, flat, single and huge values in bounded coordinates", () => {
  const path = historyGeometry([
    point("2026-01-01", "-1000000000000000000000000"),
    point("2026-01-02", "0"),
    point("2026-01-04", "1000000000000000000000000"),
  ]);
  expect(path.map((p) => p.connected)).toEqual([false, true, false]);
  expect(path.map((p) => p.y)).toEqual([220, 130, 40]);
  expect(historyGeometry([point("2026-01-01")])[0]).toMatchObject({ x: 360, y: 130 });
  expect(historyGeometry([])).toEqual([]);
});
