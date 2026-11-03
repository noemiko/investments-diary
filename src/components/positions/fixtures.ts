import type { MarketListingCandidate, PositionListItem, PositionValuation } from "@/types";

// Dev-only data for /dev/kitchen-sink: no Supabase, each array forces one table edge case.

/** At the form's limits: instrument 100 characters, category name 60 (see PositionForm.tsx validate()). */
const LONG_INSTRUMENT =
  "Vanguard FTSE All-World High Dividend Yield UCITS ETF USD Distributing Share Class London Listing XX";
const LONG_CATEGORY = "Long-term compounding thesis with dividend reinvestment plan";

export const typicalPositions: PositionListItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    instrument: "AAPL",
    buy_date: "2026-03-12",
    buy_price: "187.42",
    quantity: "15",
    broker_label: "XTB",
    sell_price: null,
    sell_date: null,
    current_price: "201.1",
    price_date: "2026-10-14",
    wallet_id: "00000000-0000-4000-8000-000000000010",
    wallet_name: "Retirement",
    category_name: "Quality growth",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    instrument: "iShares Core MSCI World",
    buy_date: "2025-11-03",
    buy_price: "92.1",
    quantity: "40.5",
    broker_label: "mBank",
    sell_price: null,
    sell_date: null,
    current_price: "88.5",
    price_date: "2026-10-01",
    wallet_id: "00000000-0000-4000-8000-000000000010",
    wallet_name: "Retirement",
    category_name: "Index core",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    instrument: "BTC",
    buy_date: "2026-08-30",
    buy_price: "61234.12345678",
    quantity: "0.00012345",
    broker_label: "Kraken",
    sell_price: null,
    sell_date: null,
    current_price: null,
    price_date: null,
    wallet_id: "00000000-0000-4000-8000-000000000010",
    wallet_name: "Retirement",
    category_name: "Speculation",
  },
];

export const positionsWithNulls: PositionListItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000004",
    instrument: "CD Projekt",
    buy_date: "2024-06-18",
    buy_price: "0.12345678",
    quantity: null,
    broker_label: null,
    sell_price: null,
    sell_date: null,
    current_price: "0.2",
    price_date: "2026-09-30",
    wallet_id: "00000000-0000-4000-8000-000000000010",
    wallet_name: "Retirement",
    category_name: "Turnaround",
  },
];

export const longTextPositions: PositionListItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000005",
    instrument: LONG_INSTRUMENT,
    buy_date: "2023-01-02",
    buy_price: "1234567.12345678",
    quantity: "98765.43210987",
    broker_label: "Interactive Brokers Ireland",
    sell_price: null,
    sell_date: null,
    current_price: null,
    price_date: null,
    wallet_id: "00000000-0000-4000-8000-000000000010",
    wallet_name: "Retirement",
    category_name: LONG_CATEGORY,
  },
];

export const closedPositions: PositionListItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000006",
    instrument: "MSFT",
    buy_date: "2025-02-10",
    buy_price: "380",
    quantity: "5",
    broker_label: "XTB",
    sell_price: "456",
    sell_date: "2026-09-01",
    current_price: null,
    price_date: null,
    wallet_id: "00000000-0000-4000-8000-000000000010",
    wallet_name: "Retirement",
    category_name: "Quality growth",
  },
];

/** Open and closed rows interleaved, as the service returns them. */
export const mixedPositions: PositionListItem[] = [typicalPositions[0], ...closedPositions, typicalPositions[1]];

const APPLE: MarketListingCandidate = {
  symbol: "AAPL",
  name: "Apple",
  exchange: "NMS",
  exchangeName: "Nasdaq",
  instrumentType: "EQUITY",
};
const healthy: PositionValuation = {
  source: "automatic",
  currency: "USD",
  selectedAt: "2026-10-14T20:00:00Z",
  marketAt: "2026-10-14T20:00:00Z",
  fetchedAt: "2026-10-14T20:05:00Z",
  marketState: "CLOSED",
  delayMinutes: 15,
  quoteState: "fresh",
  refreshOutcome: "success",
  cooldownUntil: null,
  manualSavedAt: null,
  manualPrice: null,
  manualPriceDate: null,
  listing: { ...APPLE, currency: "USD", timezone: "America/New_York" },
};
const unchecked: PositionValuation = {
  ...healthy,
  source: "missing",
  marketAt: null,
  fetchedAt: null,
  marketState: null,
  delayMinutes: null,
  refreshOutcome: null,
  listing: null,
  pendingSelection: APPLE,
};

/** One row per compact price-context state: healthy rows show no notice, the others one line each. */
export const alertPositions: PositionListItem[] = [
  { ...typicalPositions[0], id: "00000000-0000-4000-8000-000000000007", valuation: healthy },
  {
    ...typicalPositions[0],
    id: "00000000-0000-4000-8000-000000000008",
    instrument: "AAPL (failed download)",
    valuation: { ...healthy, quoteState: "cooldown", refreshOutcome: "timeout", cooldownUntil: "2026-10-14T20:20:00Z" },
  },
  {
    ...typicalPositions[2],
    id: "00000000-0000-4000-8000-000000000009",
    instrument: "AAPL (unchecked currency)",
    valuation: unchecked,
  },
  {
    ...typicalPositions[2],
    id: "00000000-0000-4000-8000-000000000011",
    instrument: "PKN.WA (currency mismatch)",
    valuation: {
      ...unchecked,
      pendingCurrency: "PLN",
      pendingSelection: { ...APPLE, symbol: "PKN.WA", name: "Orlen", exchange: "WSE", exchangeName: "Warsaw" },
    },
  },
  { ...closedPositions[0], id: "00000000-0000-4000-8000-000000000012", valuation: { ...healthy, source: "sale" } },
];
