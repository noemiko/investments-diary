import type { MarketSelectionChoice, PositionFormErrors } from "@/types";

/** Shared by the native `search_listing` POST (new.astro) and the in-place search, so both read the same. */
export const STOCK_SEARCH_COPY = {
  walletNotFound: "Choose a wallet from your list",
  invalidRequest: "Choose a wallet and enter 2–100 characters to search",
  unavailable: "Stock search is unavailable. Your entries are preserved; try searching again.",
  failed: "Stock search could not be loaded. Your entries are preserved; try again.",
} as const;

export type StockSearchOutcome =
  | { ok: true; choices: MarketSelectionChoice[] }
  | { ok: false; errors: PositionFormErrors }
  | { ok: false; cancelled: true };

/** Maps a service failure reason to the field error the native POST path shows. */
export function stockSearchErrors(reason: string): PositionFormErrors {
  if (reason === "not_found") return { wallet_id: STOCK_SEARCH_COPY.walletNotFound };
  if (reason === "invalid_request") return { listing_query: STOCK_SEARCH_COPY.invalidRequest };
  return { listing_query: STOCK_SEARCH_COPY.unavailable };
}

function isChoice(value: unknown): value is MarketSelectionChoice {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["receiptId", "targetId", "validUntil", "symbol", "name", "exchange", "exchangeName", "instrumentType"].every(
    (key) => typeof record[key] === "string",
  );
}

/** Browser only: one explicit search request; the caller owns the AbortController. */
export async function searchStockListings(
  walletId: string,
  query: string,
  signal: AbortSignal,
): Promise<StockSearchOutcome> {
  try {
    const response = await fetch("/dashboard/new/search", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId, query }),
      signal,
    });
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || !("ok" in value)) throw new Error("Invalid search response");
    if (value.ok === true && "choices" in value && Array.isArray(value.choices) && value.choices.every(isChoice))
      return { ok: true, choices: value.choices };
    if (value.ok === false && "reason" in value && typeof value.reason === "string") {
      if (value.reason === "cancelled" && signal.aborted) return { ok: false, cancelled: true };
      if (value.reason === "unauthenticated" || value.reason === "forbidden" || value.reason === "unavailable")
        return { ok: false, errors: { listing_query: STOCK_SEARCH_COPY.failed } };
      return { ok: false, errors: stockSearchErrors(value.reason) };
    }
    throw new Error("Invalid search response");
  } catch {
    if (signal.aborted) return { ok: false, cancelled: true };
    return { ok: false, errors: { listing_query: STOCK_SEARCH_COPY.failed } };
  }
}
