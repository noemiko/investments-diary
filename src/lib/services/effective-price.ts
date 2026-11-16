import { decodePosition } from "@/lib/services/decimal";
import { readDecimal } from "@/lib/decimal";
import type { PositionValuation, MarketCurrency, MarketSession } from "@/types";

export const EFFECTIVE_PRICE_COLUMNS =
  "selected_price::text,selected_date,selected_at,selected_source,wallet_currency,quote_state,refresh_outcome,cooldown_until,manual_price_saved_at,quote_market_at,quote_fetched_at,quote_symbol,quote_exchange,quote_currency,quote_timezone,listing_name,exchange_name,instrument_type,market_state,delay_minutes,pending_symbol,pending_name,pending_exchange,pending_exchange_name,pending_instrument_type,pending_outcome,pending_cooldown_until,pending_lease_until,pending_currency";
export interface EffectivePriceTransport {
  buy_price: string;
  opening_commission: string;
  closing_commission: string;
  quantity: string | null;
  current_price: string | null;
  price_date: string | null;
  sell_price: string | null;
  selected_price: string | null;
  selected_date: string | null;
  selected_at: string | null;
  selected_source: PositionValuation["source"];
  wallet_currency: MarketCurrency;
  quote_state: string;
  refresh_outcome: string | null;
  cooldown_until: string | null;
  manual_price_saved_at: string | null;
  quote_market_at: string | null;
  quote_fetched_at: string | null;
  quote_symbol: string | null;
  quote_exchange: string | null;
  quote_currency: MarketCurrency | null;
  quote_timezone: string | null;
  listing_name: string | null;
  exchange_name: string | null;
  instrument_type: "EQUITY" | "ETF" | null;
  market_state: MarketSession | null;
  delay_minutes: number | null;
  pending_symbol?: string | null;
  pending_name?: string | null;
  pending_exchange?: string | null;
  pending_exchange_name?: string | null;
  pending_instrument_type?: "EQUITY" | "ETF" | null;
  pending_outcome?: string | null;
  pending_cooldown_until?: string | null;
  pending_lease_until?: string | null;
  pending_currency?: MarketCurrency | null;
}
/** Every read surface consumes the same SQL selection while preserving editable manual facts. */
export function composeEffectivePrice<T extends EffectivePriceTransport>(row: T) {
  const {
    selected_price,
    selected_date,
    selected_at,
    selected_source,
    wallet_currency,
    quote_state,
    refresh_outcome,
    cooldown_until,
    manual_price_saved_at,
    quote_market_at,
    quote_fetched_at,
    quote_symbol,
    quote_exchange,
    quote_currency,
    quote_timezone,
    listing_name,
    exchange_name,
    instrument_type,
    market_state,
    delay_minutes,
    pending_symbol,
    pending_name,
    pending_exchange,
    pending_exchange_name,
    pending_instrument_type,
    pending_outcome,
    pending_cooldown_until,
    pending_lease_until,
    pending_currency,
    ...facts
  } = row;
  const selected = selected_price === null ? null : readDecimal(selected_price);
  const valuation: PositionValuation = {
    source: selected_source,
    currency: wallet_currency,
    selectedAt: selected_at,
    marketAt: quote_market_at,
    fetchedAt: quote_fetched_at,
    quoteState: quote_symbol
      ? quote_state
      : pending_lease_until && Date.parse(pending_lease_until) > Date.now()
        ? "refreshing"
        : pending_cooldown_until && Date.parse(pending_cooldown_until) > Date.now()
          ? "cooldown"
          : (pending_outcome ?? quote_state),
    refreshOutcome: quote_symbol ? refresh_outcome : (pending_outcome ?? refresh_outcome),
    cooldownUntil: quote_symbol ? cooldown_until : (pending_cooldown_until ?? cooldown_until),
    manualSavedAt: manual_price_saved_at,
    manualPrice: row.current_price === null ? null : readDecimal(row.current_price, true),
    manualPriceDate: row.price_date,
    marketState: market_state,
    delayMinutes: delay_minutes,
    pendingCurrency: !quote_symbol ? (pending_currency ?? null) : null,
    pendingSelection:
      !quote_symbol &&
      pending_symbol &&
      pending_name &&
      pending_exchange &&
      pending_exchange_name &&
      pending_instrument_type
        ? {
            symbol: pending_symbol,
            name: pending_name,
            exchange: pending_exchange,
            exchangeName: pending_exchange_name,
            instrumentType: pending_instrument_type,
          }
        : null,
    listing:
      quote_symbol &&
      quote_exchange &&
      quote_currency &&
      quote_timezone &&
      listing_name &&
      exchange_name &&
      instrument_type
        ? {
            symbol: quote_symbol,
            name: listing_name,
            exchange: quote_exchange,
            exchangeName: exchange_name,
            currency: quote_currency,
            timezone: quote_timezone,
            instrumentType: instrument_type,
          }
        : null,
  };
  // A zero sale is valid. Keep the positive manual quote field distinct on closed entries;
  // result helpers already select the separate sell_price/sell_date pair.
  return {
    ...decodePosition({
      ...facts,
      current_price: row.sell_price === null ? selected : row.current_price,
      price_date: row.sell_price === null ? selected_date : row.price_date,
    }),
    valuation,
  };
}
