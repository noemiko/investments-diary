/**
 * True only for a well-formed uuid. Ids from the URL are checked with this before they reach
 * PostgREST, which rejects a malformed uuid with `22P02` instead of matching no rows.
 */
export function isUuid(value: string | undefined | null): value is string {
  if (!value) {
    return false;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return false;
  }
  return true;
}
