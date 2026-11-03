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

/** A neutral direction cue for a result; never a verdict (no gain/loss colour). */
export type ResultDirection = "up" | "down" | "flat";

/** A result as text plus its direction, as rendered by every result surface. */
export interface ResultDescription {
  percent: string;
  asOf: string;
  /** From the exact ratio, so a change that rounds to `0.00%` still reads as up or down. */
  direction: ResultDirection;
}

/**
 * A result as text, shared by `PositionResult.astro` and React islands so both read the same.
 * Returns `null` when there is no price yet; the caller renders `NO_PRICE` for it.
 */
export function describeResult(input: PositionResultInput): ResultDescription | null {
  const result = positionResult(input);
  if (!result) return null;
  const shown = formatPercent(result.percent);
  return {
    percent: `${result.kind === "closed" ? "Final " : ""}${shown}`,
    asOf: `${result.kind === "closed" ? "· sold" : "as of"} ${formatDate(result.priceDate)}`,
    direction: resultDirection(result.percent, shown),
  };
}

/**
 * Which way the result icon points. `exact` is the unrounded ratio (its denominator, the buy price, is
 * always positive, so `exact.numerator` alone carries the sign); `shown` is the text beside the icon,
 * e.g. `"+20.00%"`, `"-0.01%"` or `"0.00%"`.
 */
function resultDirection(exact: ExactRatio, shown: string): ResultDirection {
  if (exact.numerator > 0n) return "up";
  if (exact.numerator < 0n) return "down";
  return shown.startsWith("-") ? "down" : "flat";
}
