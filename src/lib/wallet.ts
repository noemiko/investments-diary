import { positionResult, type PositionResultInput } from "@/lib/result";
import type { Wallet, WalletPosition } from "@/types";

/** A wallet's value against the last manually entered prices of its positions (FR-013). */
export interface WalletValueResult {
  /** `starting_value + change`. */
  value: number;
  /** Σ `amount` of the counted positions, i.e. Σ (current_price − buy_price) × quantity. */
  change: number;
  /** `change / starting_value × 100`, or `null` when the starting value is 0. */
  changePercent: number | null;
  /** Positions whose result went into `change`. */
  counted: number;
  /** Positions left out because they have no quantity or no current price yet. */
  notCounted: number;
  /** The oldest price date among the counted positions (`YYYY-MM-DD`), or `null` when none counted. */
  asOf: string | null;
}

/**
 * The single definition of a wallet's value (FR-013). Pure, no I/O. Each position's result comes
 * from `positionResult`, so a wallet never computes a position's result differently from the list
 * or the detail page. The caller passes only the wallet's non-deleted positions.
 */
export function walletValue(
  wallet: Pick<Wallet, "starting_value">,
  positions: readonly PositionResultInput[],
): WalletValueResult {
  let change = 0;
  let counted = 0;
  let notCounted = 0;
  let asOf: string | null = null;

  for (const position of positions) {
    const result = positionResult(position);

    if (result?.amount == null) {
      notCounted++;
      continue;
    }

    change += result.amount;
    counted++;

    if (asOf === null || result.priceDate < asOf) {
      asOf = result.priceDate;
    }
  }
  return {
    value: wallet.starting_value + change,
    change,
    changePercent: wallet.starting_value === 0 ? null : (change / wallet.starting_value) * 100,
    counted,
    notCounted,
    asOf,
  };
}

/** Groups positions by their wallet, so each wallet's value is computed from one read of all positions. */
export function groupByWallet(positions: readonly WalletPosition[]): Map<string, WalletPosition[]> {
  const groups = new Map<string, WalletPosition[]>();
  for (const position of positions) {
    const group = groups.get(position.wallet_id);
    if (group) group.push(position);
    else groups.set(position.wallet_id, [position]);
  }
  return groups;
}
