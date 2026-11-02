import { expect, it } from "vitest";
import { composeEffectivePrice, type EffectivePriceTransport } from "./effective-price";
const row: EffectivePriceTransport = {
  buy_price: "10",
  quantity: "2",
  current_price: "15",
  price_date: "2026-01-01",
  sell_price: null,
  selected_price: "12.12345678",
  selected_date: "2026-01-02",
  selected_at: "2026-01-02T12:00:00Z",
  selected_source: "automatic",
  wallet_currency: "USD",
  quote_state: "success",
  refresh_outcome: "success",
  cooldown_until: null,
  manual_price_saved_at: null,
  quote_market_at: "2026-01-02T12:00:00Z",
  quote_fetched_at: "2026-01-03T12:00:00Z",
  quote_symbol: "AAPL",
  quote_exchange: "NMS",
  quote_currency: "USD",
  quote_timezone: "America/New_York",
  listing_name: "Apple",
  exchange_name: "Nasdaq",
  instrument_type: "EQUITY",
  market_state: "CLOSED",
  delay_minutes: 15,
};
it("composes exact SQL-selected open values while retaining manual input and actual quote timing", () => {
  const actual = composeEffectivePrice(row);
  expect(actual.current_price).toBe("12.12345678");
  expect(actual.price_date).toBe("2026-01-02");
  expect(actual.valuation).toMatchObject({
    manualPrice: "15",
    manualPriceDate: "2026-01-01",
    source: "automatic",
    currency: "USD",
    marketAt: "2026-01-02T12:00:00Z",
    fetchedAt: "2026-01-03T12:00:00Z",
    marketState: "CLOSED",
    delayMinutes: 15,
  });
});
it("keeps zero sales distinct from the positive manual-price field", () => {
  const actual = composeEffectivePrice({ ...row, sell_price: "0", selected_price: "0", selected_source: "sale" });
  expect(actual.sell_price).toBe("0");
  expect(actual.current_price).toBe("15");
  expect(actual.valuation.source).toBe("sale");
});
it("rejects financial numeric JSON instead of silently losing precision", () => {
  expect(() => composeEffectivePrice({ ...row, selected_price: 12 as unknown as string })).toThrow();
});
it("exposes a pending search identity without inventing currency, timezone or a selected quote", () => {
  const actual = composeEffectivePrice({
    ...row,
    current_price: null,
    selected_price: null,
    selected_source: "missing",
    quote_symbol: null,
    quote_currency: null,
    quote_timezone: null,
    pending_symbol: "PKO.WA",
    pending_name: "PKO Bank Polski",
    pending_exchange: "WSE",
    pending_exchange_name: "Warsaw",
    pending_instrument_type: "EQUITY",
    pending_outcome: "never",
  });
  expect(actual.current_price).toBeNull();
  expect(actual.valuation.listing).toBeNull();
  expect(actual.valuation.pendingSelection).toMatchObject({ symbol: "PKO.WA", exchange: "WSE" });
  expect(actual.valuation.pendingSelection).not.toHaveProperty("currency");
  expect(actual.valuation.pendingSelection).not.toHaveProperty("timezone");
});
