// One number and date format for the positions list, the detail page and the result.

// Prices and quantities are stored as numeric(20,8); no currency, since a broker is only a label.
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });
// Sign shown for gains and losses, not for a (rounded) zero.
const percentFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
// An instant (e.g. `deleted_at`) is shown on the author's calendar day, not UTC's.
const timestampFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "Europe/Warsaw" });

/** A price or quantity, en-US, up to 8 fraction digits. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** A `YYYY-MM-DD` date, en-US medium style, read as UTC so it never shifts a day. */
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

/** An ISO timestamp as its date, en-US medium style, on the author's (Europe/Warsaw) calendar day. */
export function formatTimestamp(isoTimestamp: string): string {
  return timestampFormat.format(new Date(isoTimestamp));
}

/** A result percentage, e.g. `+20.00%`: two decimals, sign shown except for zero. */
export function formatPercent(value: number): string {
  return `${percentFormat.format(value)}%`;
}
