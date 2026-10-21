/** Exact finite amounts use 16 places: the product of two numeric(20,8) inputs. */
export interface ExactAmount {
  units: bigint;
  scale: 16;
}

/** A percentage is not divided until display, avoiding double rounding of repeating decimals. */
export interface ExactRatio {
  numerator: bigint;
  denominator: bigint;
}

export const INPUT_FACTOR = 100_000_000n;
export const AMOUNT_FACTOR = 10_000_000_000_000_000n;

/** Canonical nonnegative decimal text; callers validate the numeric(20,8) shape first. */
export function canonicalDecimal(value: string): string {
  const [integer, fraction = ""] = value.split(".");
  const whole = integer.replace(/^0+(?=\d)/, "");
  const part = fraction.replace(/0+$/, "");
  return part ? `${whole}.${part}` : whole;
}

/** Converts a validated, nonnegative numeric(20,8) string to exact units. */
export function decimalUnits(value: string): bigint {
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(value)) throw new Error("Invalid decimal input");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * INPUT_FACTOR + BigInt(fraction.padEnd(8, "0"));
}

export function exactAmount(units: bigint): ExactAmount {
  return { units, scale: 16 };
}

/** Returns hundredths, rounded once, with exact ties away from zero. */
export function roundedHundredths({ numerator, denominator }: ExactRatio): bigint {
  if (denominator <= 0n) throw new Error("Expected a positive denominator");
  const magnitude = numerator < 0n ? -numerator : numerator;
  const scaled = magnitude * 100n;
  const rounded = scaled / denominator + ((scaled % denominator) * 2n >= denominator ? 1n : 0n);
  return numerator < 0n ? -rounded : rounded;
}

/** Strict boundary decoder: never repair a numeric JSON value that has already lost digits. */
export function readDecimal(value: unknown, positive = false): string {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,8})?$/.test(value)) {
    throw new Error("Expected decimal text from database");
  }
  const canonical = canonicalDecimal(value);
  if (positive && canonical === "0") throw new Error("Expected a positive database decimal");
  return canonical;
}
