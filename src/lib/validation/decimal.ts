// Kept free of zod so the entry-form island can import it without pulling the schema library into the client bundle.

/** Parses a user-typed decimal ("50,25", "1 200.5") into a number, or null if it is not a valid number. */
export function parseDecimal(raw: string): number | null {
  const normalized = raw.replaceAll(" ", "");

  // Digits, optionally followed by exactly one decimal separator and more digits.
  if (!/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    return null;
  }

  return Number(normalized.replace(",", "."));
}
