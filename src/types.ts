import type { Tables } from "@/db/database.types";

type CategoryRow = Tables<"reason_categories">;
type PositionRow = Omit<Tables<"positions">, "buy_price" | "quantity" | "current_price" | "sell_price"> & {
  buy_price: string;
  quantity: string | null;
  current_price: string | null;
  sell_price: string | null;
};
type WalletRow = Omit<Tables<"wallets">, "starting_value"> & { starting_value: string };

/** A reason category the author can file a position under (FR-005). */
export type ReasonCategory = Pick<CategoryRow, "id" | "name">;

/** One row of the positions list on the dashboard (FR-010). */
export type PositionListItem = Pick<
  PositionRow,
  | "id"
  | "instrument"
  | "buy_date"
  | "buy_price"
  | "quantity"
  | "broker_label"
  | "current_price"
  | "price_date"
  | "sell_price"
  | "sell_date"
  | "wallet_id"
> & {
  category_name: string;
  wallet_name: string;
  valuation?: PositionValuation;
};

/** One position on its detail page (FR-011): the list row plus the full reason. */
export type PositionDetail = PositionListItem & Pick<PositionRow, "reason_text">;

/** One earlier position as the confrontation panel shows it, grouped by `category_id` on the client. */
export type ConfrontationPosition = Pick<
  PositionRow,
  | "id"
  | "category_id"
  | "instrument"
  | "buy_date"
  | "buy_price"
  | "quantity"
  | "current_price"
  | "price_date"
  | "sell_price"
  | "sell_date"
  | "reason_text"
> & { valuation?: PositionValuation };

/** One row of the Deleted positions page (FR-009): only rows that have a `deleted_at`. */
export type DeletedPositionItem = Pick<PositionRow, "id" | "instrument" | "buy_date" | "deleted_at"> & {
  deleted_at: string;
  category_name: string;
};

/** The entry form after parsing: exactly one of `category_id` / `new_category_name` is set. */
export type NewPositionInput = Pick<
  PositionRow,
  "instrument" | "buy_date" | "buy_price" | "quantity" | "broker_label" | "reason_text" | "wallet_id"
> & { listing_receipt_id: string } & (
    { category_id: string; new_category_name: null } | { category_id: null; new_category_name: string }
  );

export const POSITION_FORM_FIELDS = [
  "instrument",
  "listing_receipt_id",
  "listing_query",
  "buy_price",
  "buy_date",
  "wallet_id",
  "category_id",
  "new_category_name",
  "reason_text",
  "quantity",
  "broker_label",
] as const;

export type PositionFormField = (typeof POSITION_FORM_FIELDS)[number];

/** The `category_id` value of the "New category…" choice: the name comes from `new_category_name` instead. */
export const NEW_CATEGORY_CHOICE = "__new__";

/** Raw form values as submitted, echoed back into the form when a submission is rejected. */
export type PositionFormValues = Record<PositionFormField, string>;

/** One message per field; `form` carries errors that belong to no single field. */
export type PositionFormErrors = Partial<Record<PositionFormField | "form", string>>;

/** The price form after parsing (FR-006): both fields are required. */
export interface PriceUpdateInput {
  current_price: string;
  price_date: string;
}

export const PRICE_FORM_FIELDS = ["current_price", "price_date"] as const;

export type PriceFormField = (typeof PRICE_FORM_FIELDS)[number];

/** Raw price-form values as submitted, echoed back into the form when a submission is rejected. */
export type PriceFormValues = Record<PriceFormField, string>;

/** One message per field; `form` carries errors that belong to no single field. */
export type PriceFormErrors = Partial<Record<PriceFormField | "form", string>>;

/** A wallet the author files positions under (FR-013). */
export type Wallet = Pick<WalletRow, "id" | "name" | "starting_value"> & {
  currency: MarketCurrency;
};

/** The fields of a position a wallet's value is computed from, grouped by `wallet_id`. */
export type WalletPosition = Pick<
  PositionRow,
  "wallet_id" | "buy_price" | "quantity" | "current_price" | "price_date" | "sell_price" | "sell_date"
>;

/** The wallet form after parsing: a name and a starting value of 0 or more. */
export type WalletInput = Pick<WalletRow, "name" | "starting_value"> & {
  currency: MarketCurrency;
};

export const WALLET_FORM_FIELDS = ["name", "starting_value", "currency"] as const;

export type WalletFormField = (typeof WALLET_FORM_FIELDS)[number];

/** Raw wallet-form values as submitted, echoed back into the form when a submission is rejected. */
export type WalletFormValues = Record<WalletFormField, string>;

/** One message per field; `form` carries errors that belong to no single field. */
export type WalletFormErrors = Partial<Record<WalletFormField | "form", string>>;

/** A full sale (FR-007); acknowledgement belongs only to the form. */
export interface ClosePositionInput {
  sell_price: string;
  sell_date: string;
}

export const CLOSE_POSITION_FORM_FIELDS = ["sell_price", "sell_date", "acknowledgement"] as const;
export type ClosePositionFormField = (typeof CLOSE_POSITION_FORM_FIELDS)[number];
export type ClosePositionFormValues = Record<ClosePositionFormField, string>;
export type ClosePositionFormErrors = Partial<Record<ClosePositionFormField | "form", string>>;

/** Exact decimal-text daily observations (FR-013); financial values never cross JSON as numbers. */
export interface WalletSnapshot {
  wallet_id: string;
  observation_day: string;
  captured_at: string;
  starting_value: string;
  value: string;
  realised_change: string;
  open_change: string;
  realised_count: number;
  open_count: number;
  not_counted: number;
  as_of: string | null;
  currency: MarketCurrency;
  automatic_count?: number | null;
  manual_count?: number | null;
  oldest_market_at?: string | null;
}

/** Confirmed quote denomination; automatic tracking supports USD, PLN and EUR without FX. */
export const MARKET_CURRENCIES = ["USD", "PLN", "EUR"] as const;
export type MarketCurrency = (typeof MARKET_CURRENCIES)[number];

export interface MarketListingCandidate {
  symbol: string;
  name: string;
  exchange: string;
  exchangeName: string;
  instrumentType: "EQUITY" | "ETF";
}

export interface MarketSelectionChoice extends MarketListingCandidate {
  receiptId: string;
  targetId: string;
  validUntil: string;
}

/** Search does not establish currency: obtain this identity from a validated quote before linking. */
export interface MarketListing extends MarketListingCandidate {
  currency: MarketCurrency;
  timezone: string;
}

export type MarketSession = "REGULAR" | "CLOSED" | "PRE" | "PREPRE" | "POST" | "POSTPOST";

/** Regular-session quote normalized at the provider boundary, independently of recorded manual prices. */
export interface MarketQuote {
  provider: "yahoo";
  listing: MarketListing;
  price: string;
  marketAt: string;
  marketDate: string;
  fetchedAt: string;
  marketState: MarketSession;
  sourceIntervalMinutes: number | null;
  delayMinutes: number | null;
  sourceName: string | null;
}

export type MarketDataFailureReason =
  "invalid_request" | "not_found" | "invalid_quote" | "provider_unavailable" | "timeout" | "cancelled";

/** Deliberately excludes provider messages, response bodies, cookies and URLs. */
export interface MarketDataFailure {
  ok: false;
  reason: MarketDataFailureReason;
  status?: number;
  /** Sanitized provider Retry-After instant, never a response header/body. */
  retryAfter?: string;
}

export type MarketQuoteOutcome = { ok: true; quote: MarketQuote } | MarketDataFailure;
export type MarketSearchResult = { ok: true; listings: MarketListingCandidate[] } | MarketDataFailure;
export type MarketQuoteBatchResult = { ok: true; quotes: Record<string, MarketQuoteOutcome> } | MarketDataFailure;

/** Explicit shared valuation projection. Numeric fields must be selected as ::text. */
export interface EffectivePrice {
  selected_price: string | null;
  selected_date: string | null;
  selected_at: string | null;
  selected_source: "sale" | "manual_override" | "automatic" | "manual" | "missing";
  quote_state: string;
  wallet_currency: MarketCurrency;
  manual_price_saved_at: string | null;
}

/** Result of an explicit download; due work has not been sent to the provider. */
export interface MarketPriceDownloadItem {
  listingId: string;
  symbol: string;
  outcome:
    "success" | "older_quote" | "cooldown" | "refreshing" | "due" | "incompatible_currency" | MarketDataFailureReason;
  incompatibleCount?: number;
  retryAfter: string | null;
}
export type MarketPriceServiceFailure =
  | {
      ok: false;
      reason: "not_found" | "incompatible_currency" | "lookup_expired" | "cooldown" | "refreshing" | "invalid_request";
      retryAfter?: string | null;
    }
  | MarketDataFailure;
/** Cached database selection context, kept separate from editable manual inputs. */
export interface PositionValuation {
  source: EffectivePrice["selected_source"];
  currency: MarketCurrency;
  selectedAt: string | null;
  marketAt: string | null;
  fetchedAt: string | null;
  marketState: MarketSession | null;
  delayMinutes: number | null;
  quoteState: string;
  refreshOutcome: string | null;
  cooldownUntil: string | null;
  manualSavedAt: string | null;
  manualPrice: string | null;
  manualPriceDate: string | null;
  listing: MarketListing | null;
  pendingSelection?: MarketListingCandidate | null;
  pendingCurrency?: MarketCurrency | null;
}

export interface MovePositionInput {
  wallet_id: string;
}
