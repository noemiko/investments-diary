// Kept free of zod so the entry-form island can import it without pulling the schema library into the client bundle.

/**
 * Parses a user-typed decimal ("50,25", "1 200.5") into a number, or null if it is not a valid number.
 * At most 12 integer digits and 8 decimals: the shape of the `numeric(20,8)` columns, so an
 * out-of-range value is a field error here rather than a generic save error from the database.
 */
export function parseDecimal(raw: string): number | null {
  // \s also covers the non-breaking and narrow spaces that locale-formatted numbers are pasted with.
  const normalized = raw.replace(/\s/g, "");

  // 1–12 digits, optionally followed by exactly one decimal separator and 1–8 more digits.
  if (!/^\d{1,12}(?:[.,]\d{1,8})?$/.test(normalized)) {
    return null;
  }

  return Number(normalized.replace(",", "."));
}
