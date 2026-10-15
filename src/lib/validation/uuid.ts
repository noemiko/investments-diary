import { z } from "astro/zod";

const uuidSchema = z.uuid();

/**
 * True only for a well-formed uuid: the one uuid check in the app, for ids from the URL and from forms.
 * PostgREST rejects a malformed uuid with `22P02` instead of matching no rows, so check before querying.
 */
export function isUuid(value: string | undefined | null): value is string {
  return uuidSchema.safeParse(value).success;
}
