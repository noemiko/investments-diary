import { AMOUNT_FACTOR, decimalUnits, roundedHundredths, type ExactAmount, type ExactRatio } from "@/lib/decimal";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const timestampFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "Europe/Warsaw" });

function grouped(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function twoPlaces(ratio: ExactRatio, signed: boolean): string {
  const rounded = roundedHundredths(ratio);
  const magnitude = rounded < 0n ? -rounded : rounded;
  const digits = magnitude.toString().padStart(3, "0");
  const prefix = rounded < 0n ? "-" : signed && rounded > 0n ? "+" : "";
  return `${prefix}${grouped(digits.slice(0, -2))}.${digits.slice(-2)}`;
}

/** Exact price or quantity, en-US, with at most eight fraction digits. */
export function formatNumber(value: string): string {
  // Validates the domain value without passing through Number.
  decimalUnits(value);
  const [whole, fraction = ""] = value.split(".");
  const part = fraction.replace(/0+$/, "");
  return `${grouped(whole)}${part ? `.${part}` : ""}`;
}

function amountRatio(value: string | ExactAmount): ExactRatio {
  return typeof value === "string"
    ? { numerator: decimalUnits(value), denominator: 100_000_000n }
    : { numerator: value.units, denominator: AMOUNT_FACTOR };
}

/** Wallet values have two places; only the final result is rounded. */
export function formatAmount(value: string | ExactAmount): string {
  return twoPlaces(amountRatio(value), false);
}

export function formatSignedAmount(value: string | ExactAmount): string {
  return twoPlaces(amountRatio(value), true);
}

/** Date-only values never shift with the runtime's timezone. */
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatTimestamp(isoTimestamp: string): string {
  return timestampFormat.format(new Date(isoTimestamp));
}

export function formatPercent(value: ExactRatio): string {
  return `${twoPlaces(value, true)}%`;
}
