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
export function positionResult(_input: PositionResultInput): PositionResultValue | null {
  if (!_input.current_price || !_input.price_date) {
    return null;
  }
  return {
    percent: ((_input.current_price - _input.buy_price) / _input.buy_price) * 100,
    amount: _input.quantity == null ? null : (_input.current_price - _input.buy_price) * _input.quantity,
    priceDate: _input.price_date,
  };
}
