import { canonicalDecimal } from "@/lib/decimal";

// Shared by server schemas and the React form; keep free of schema dependencies.
/** A nonnegative numeric(20,8), with optional correctly grouped thousands and comma/dot decimals. */
export function parseDecimal(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,8})?$/.test(trimmed)) return null;
  const normalized = trimmed.replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(normalized)) return null;
  return canonicalDecimal(normalized);
}
