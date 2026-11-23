import { z } from "astro/zod";

export const TRANSFER_LIMITS = Object.freeze({
  fileBytes: 4 * 1024 * 1024,
  uncompressedBytes: 32 * 1024 * 1024,
  payloadBytes: 8 * 1024 * 1024,
  records: 10_000,
  zipEntries: 256,
  chunkCharacters: 24_000,
});

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();
const decimal = z.string().regex(/^\d{1,12}(?:\.\d{1,8})?$/);
const positive = decimal.refine((value) => /[1-9]/.test(value), "Expected a positive decimal");
const currency = z.enum(["USD", "PLN", "EUR"]);
// PostgreSQL char_length counts Unicode code points, not JavaScript UTF-16 code units.
const dbText = (min: number, max: number) =>
  z.string().refine((value) => {
    let length = 0;
    for (const _character of value) {
      if (++length > max) return false;
    }
    return length >= min;
  }, "Text length exceeds database limits");
const named = dbText(1, 60).refine((value) => value === value.trim());
const stockIdentity = {
  provider: z.literal("yahoo"),
  symbol: z.string().regex(/^[A-Z0-9^][A-Z0-9.^=/_-]{0,49}$/),
  exchange: z.string().regex(/^[A-Z0-9]{1,20}$/),
  listing_name: dbText(1, 200),
  exchange_name: dbText(1, 200),
  instrument_type: z.enum(["EQUITY", "ETF"]),
};
const wallet = z.strictObject({ id, name: named, starting_value: decimal, currency, created_at: timestamp });
const category = z.strictObject({ id, name: named, created_at: timestamp, deleted_at: timestamp.nullable() });
const target = z.strictObject({ id, ...stockIdentity, cache_id: id.nullable() });
const quote = z.strictObject({
  id,
  ...stockIdentity,
  currency,
  timezone: dbText(1, 100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  price: positive.nullable(),
  market_at: timestamp.nullable(),
  market_date: date.nullable(),
  fetched_at: timestamp.nullable(),
  market_state: z.enum(["REGULAR", "CLOSED", "PRE", "PREPRE", "POST", "POSTPOST"]).nullable(),
  delay_minutes: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .max(100)
    .nullable(),
  source_interval_minutes: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .max(100)
    .nullable(),
  source_name: dbText(0, 200).nullable(),
  created_at: timestamp,
});
const position = z.strictObject({
  id,
  wallet_id: id,
  category_id: id,
  instrument: dbText(1, 100).refine((value) => value === value.trim()),
  buy_date: date,
  buy_price: positive,
  opening_commission: decimal,
  closing_commission: decimal,
  quantity: positive.nullable(),
  broker_label: dbText(0, 60).nullable(),
  reason_text: dbText(0, 10_000).nullable(),
  created_at: timestamp,
  current_price: positive.nullable(),
  price_date: date.nullable(),
  manual_price_saved_at: timestamp.nullable(),
  sell_price: decimal.nullable(),
  sell_date: date.nullable(),
  market_target_id: id,
  market_listing_id: id.nullable(),
  listing_confirmed_at: timestamp.nullable(),
  selected_price: decimal.nullable(),
  selected_date: date.nullable(),
  selected_at: timestamp.nullable(),
  selected_source: z.enum(["automatic", "manual", "manual_override", "sale", "missing"]),
});
const collection = <T extends z.ZodType>(schema: T) => z.array(schema).max(TRANSFER_LIMITS.records);

export const portfolioDataSchema = z
  .strictObject({
    wallets: collection(wallet),
    categories: collection(category),
    positions: collection(position),
    targets: collection(target),
    quotes: collection(quote),
  })
  .superRefine((data, ctx) => {
    const fail = (message: string) => {
      ctx.addIssue({ code: "custom", message });
    };
    for (const rows of Object.values(data)) {
      if (new Set(rows.map((row) => row.id)).size !== rows.length) fail("Duplicate record identity");
    }
    const wallets = new Map(data.wallets.map((row) => [row.id, row]));
    const categories = new Set(data.categories.map((row) => row.id));
    const targets = new Map(data.targets.map((row) => [row.id, row]));
    const quotes = new Map(data.quotes.map((row) => [row.id, row]));
    if (new Set(data.wallets.map((row) => row.name.toLowerCase())).size !== data.wallets.length)
      fail("Duplicate active wallet name");
    const activeCategories = data.categories.filter((row) => row.deleted_at === null);
    if (new Set(activeCategories.map((row) => row.name.toLowerCase())).size !== activeCategories.length)
      fail("Duplicate active category name");
    const sameStock = (a: z.infer<typeof target>, b: z.infer<typeof quote>) =>
      a.symbol === b.symbol && a.exchange === b.exchange && a.instrument_type === b.instrument_type;
    for (const row of data.targets) {
      if (row.cache_id !== null) {
        const cached = quotes.get(row.cache_id);
        if (!cached || !sameStock(row, cached)) fail("Invalid target quote relationship");
      }
    }
    for (const row of data.quotes) {
      const quoteFields = [row.price, row.market_at, row.market_date, row.fetched_at, row.market_state];
      if (!quoteFields.every((value) => value === null) && !quoteFields.every((value) => value !== null))
        fail("Incomplete quote evidence");
      if (row.market_at && row.fetched_at && Date.parse(row.market_at) > Date.parse(row.fetched_at))
        fail("Quote market time follows fetch time");
    }
    for (const row of data.positions) {
      const ownedWallet = wallets.get(row.wallet_id);
      const selectedTarget = targets.get(row.market_target_id);
      if (!ownedWallet || !categories.has(row.category_id) || !selectedTarget) fail("Missing investment relationship");
      if ((row.current_price === null) !== (row.price_date === null)) fail("Incomplete manual price");
      if ((row.sell_price === null) !== (row.sell_date === null)) fail("Incomplete sale");
      if (row.sell_date !== null && row.sell_date < row.buy_date) fail("Sale precedes purchase");
      if (row.price_date !== null && row.price_date < row.buy_date) fail("Manual price precedes purchase");
      if (row.quantity === null && (/[1-9]/.test(row.opening_commission) || /[1-9]/.test(row.closing_commission)))
        fail("Commission requires quantity");
      if (row.sell_price === null && /[1-9]/.test(row.closing_commission)) fail("Closing commission requires sale");
      if ((row.market_listing_id === null) !== (row.listing_confirmed_at === null))
        fail("Incomplete listing confirmation");
      if (row.market_listing_id !== null) {
        const cached = quotes.get(row.market_listing_id);
        if (
          !cached ||
          !selectedTarget ||
          !sameStock(selectedTarget, cached) ||
          cached.currency !== ownedWallet?.currency
        )
          fail("Invalid investment quote relationship");
      }
    }
  });

export const recoveryPayloadSchema = z.strictObject({
  version: z.literal(1),
  export_id: id,
  exported_at: timestamp,
  deployment_id: dbText(1, 200),
  data: portfolioDataSchema,
});
export type PortfolioData = z.infer<typeof portfolioDataSchema>;
export type RecoveryPayload = z.infer<typeof recoveryPayloadSchema>;
