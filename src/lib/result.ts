import { decimalUnits, exactAmount, type ExactAmount, type ExactRatio } from "@/lib/decimal";
import { formatDate, formatPercent } from "@/lib/format";
import type { PositionListItem } from "@/types";

/** The fields a position's result is computed from. */
export type PositionResultInput = Pick<
  PositionListItem,
  "buy_price" | "quantity" | "current_price" | "price_date" | "sell_price" | "sell_date"
>;

/** A final sale result or an open position's latest manually entered result. */
export interface PositionResultValue {
  kind: "open" | "closed";
  /** `(result_price − buy_price) / buy_price × 100`. */
  percent: ExactRatio;
  /** `(result_price − buy_price) × quantity`, or `null` when the position has no quantity. */
  amount: ExactAmount | null;
  /** The sale date when closed, otherwise the quote date (`YYYY-MM-DD`). */
  priceDate: string;
}

/**
 * The single definition of a position's result (S-02, reused by S-03 and S-04). Pure, no I/O.
 * Returns `null` when an open position has no current price; otherwise `percent`, `amount` (null without
 * a quantity) and `priceDate` as documented on `PositionResultValue`.
 */
export function positionResult(input: PositionResultInput): PositionResultValue | null {
  const closed = input.sell_price !== null && input.sell_date !== null;
  const price = closed ? input.sell_price : input.current_price;
  const date = closed ? input.sell_date : input.price_date;
  if (price === null || date === null) {
    return null;
  }
  const buy = decimalUnits(input.buy_price);
  const difference = decimalUnits(price) - buy;
  return {
    kind: closed ? "closed" : "open",
    percent: { numerator: difference * 100n, denominator: buy },
    amount: input.quantity === null ? null : exactAmount(difference * decimalUnits(input.quantity)),
    priceDate: date,
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
  return {
    percent: `${result.kind === "closed" ? "Final " : ""}${formatPercent(result.percent)}`,
    asOf: `${result.kind === "closed" ? "· sold" : "as of"} ${formatDate(result.priceDate)}`,
  };
}
