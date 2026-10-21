import { readDecimal } from "@/lib/decimal";

/** All numeric read paths pass through this decoder, including nullable cast projections. */
export function decodePosition<T extends { buy_price: unknown; quantity: unknown; current_price: unknown }>(row: T) {
  return {
    ...row,
    buy_price: readDecimal(row.buy_price, true),
    quantity: row.quantity === null ? null : readDecimal(row.quantity, true),
    current_price: row.current_price === null ? null : readDecimal(row.current_price, true),
  };
}
