// One number and date format for the positions list, the detail page and the result.

// Prices and quantities are stored as numeric(20,8); no currency, since a broker is only a label.
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** A price or quantity, en-US, up to 8 fraction digits. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** A `YYYY-MM-DD` date, en-US medium style, read as UTC so it never shifts a day. */
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}
