import { INPUT_FACTOR, decimalUnits, exactAmount, type ExactAmount, type ExactRatio } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { positionResult, type PositionResultInput } from "@/lib/result";
import type { Wallet, WalletPosition } from "@/types";

/** Starting value plus realised and open-position results (FR-013). */
export interface WalletValueResult {
  /** `starting_value + change`. */
  value: ExactAmount;
  /** Σ `amount` of the counted positions, i.e. Σ (result_price − buy_price) × quantity. */
  change: ExactAmount;
  /** `change / starting_value × 100`, or `null` when the starting value is 0. */
  changePercent: ExactRatio | null;
  /** Positions whose result went into `change`. */
  counted: number;
  realisedCount: number;
  openCount: number;
  /** Missing quantity, or an open position without a current quote. */
  notCounted: number;
  /** Oldest counted open quote date (`YYYY-MM-DD`), or null without counted open quotes. */
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
  let change = 0n;
  let counted = 0;
  let realisedCount = 0;
  let openCount = 0;
  let notCounted = 0;
  let asOf: string | null = null;

  for (const position of positions) {
    const result = positionResult(position);

    if (result?.amount == null) {
      notCounted++;
      continue;
    }

    change += result.amount.units;
    counted++;

    if (result.kind === "closed") realisedCount++;
    else {
      openCount++;
      if (asOf === null || result.priceDate < asOf) asOf = result.priceDate;
    }
  }
  const starting = decimalUnits(wallet.starting_value) * INPUT_FACTOR;
  return {
    value: exactAmount(starting + change),
    change: exactAmount(change),
    changePercent: starting === 0n ? null : { numerator: change * 100n, denominator: starting },
    counted,
    realisedCount,
    openCount,
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

/** Shared wording for summary and detail so realised sales never imply quote freshness. */
export function describeWalletResults(result: WalletValueResult): string {
  if (result.counted === 0) return "No counted results";
  if (result.openCount === 0) return "Realised results only";
  const freshness = result.asOf === null ? "" : `Open prices as of ${formatDate(result.asOf)}`;
  return result.realisedCount > 0 ? `${freshness} · Includes realised gains/losses` : freshness;
}
