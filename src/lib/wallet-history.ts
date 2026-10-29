import { exactAmount } from "@/lib/decimal";
import type { WalletSnapshot } from "@/types";

/** Signed unrestricted aggregate with at most 16 places; deliberately not a price decoder. */
export function aggregateUnits(value: unknown): bigint {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,16})?$/.test(value)) {
    throw new Error("Expected exact aggregate decimal text");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const units = BigInt(whole) * 10_000_000_000_000_000n + BigInt(fraction.padEnd(16, "0"));
  return negative ? -units : units;
}
export const aggregateAmount = (value: string) => exactAmount(aggregateUnits(value));
export type HistoryRange = "30" | "90" | "365" | "all";
const DAY = 86_400_000;
const dayTime = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function historyRange(points: readonly WalletSnapshot[], range: HistoryRange, today: string) {
  const end = dayTime(today);
  const start = range === "all" ? -Infinity : end - (Number(range) - 1) * DAY;
  return points.filter((point) => dayTime(point.observation_day) >= start && dayTime(point.observation_day) <= end);
}

/** Only bounded coordinates pass through Number; labels continue using original decimal text. */
export function historyGeometry(points: readonly WalletSnapshot[]) {
  if (!points.length) return [];
  const amounts = points.map((p) => aggregateUnits(p.value));
  let min = amounts.reduce((a, b) => (a < b ? a : b));
  let max = amounts.reduce((a, b) => (a > b ? a : b));
  if (min === max) {
    min -= 10_000_000_000_000_000n;
    max += 10_000_000_000_000_000n;
  }
  const first = dayTime(points[0].observation_day);
  const last = dayTime(points[points.length - 1].observation_day);
  return points.map((point, index) => ({
    point,
    x: last === first ? 360 : 24 + ((dayTime(point.observation_day) - first) / (last - first)) * 672,
    y: 220 - Number(((amounts[index] - min) * 180_000n) / (max - min)) / 1000,
    connected: index > 0 && dayTime(point.observation_day) - dayTime(points[index - 1].observation_day) === DAY,
  }));
}
