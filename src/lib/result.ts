import { formatDate, formatPercent } from "@/lib/format";
import type { PositionListItem } from "@/types";

/** The fields a position's result is computed from. */
export type PositionResultInput = Pick<PositionListItem, "buy_price" | "quantity" | "current_price" | "price_date">;

/** A position's result against its last manually entered price. */
export interface PositionResultValue {
  /** `(current_price − buy_price) / buy_price × 100`. */
  percent: number;
  /** `(current_price − buy_price) × quantity`, or `null` when the position has no quantity. */
  amount: number | null;
  /** The date the current price was entered for (`YYYY-MM-DD`). */
  priceDate: string;
}

/**
 * The single definition of a position's result (S-02, reused by S-03 and S-04). Pure, no I/O.
 * Returns `null` when there is no current price yet; otherwise `percent`, `amount` (null without
 * a quantity) and `priceDate` as documented on `PositionResultValue`.
 */
export function positionResult(input: PositionResultInput): PositionResultValue | null {
  if (input.current_price === null || input.price_date === null) {
    return null;
  }
  return {
    percent: ((input.current_price - input.buy_price) / input.buy_price) * 100,
    amount: input.quantity == null ? null : (input.current_price - input.buy_price) * input.quantity,
    priceDate: input.price_date,
  };
}

/** What a position without a current price shows instead of a result. */
export const NO_PRICE = "No price yet";

/**
 * A result as text, shared by `PositionResult.astro` and React islands so both read the same.
 * Returns `null` when there is no price yet; the caller renders `NO_PRICE` for it.
 */
export function describeResult(input: PositionResultInput): { percent: string; asOf: string } | null {
  const result = positionResult(input);
  if (!result) return null;
  return { percent: formatPercent(result.percent), asOf: `as of ${formatDate(result.priceDate)}` };
}
