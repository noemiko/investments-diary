import { serviceError } from "@/lib/observability/reporter";

// Stay below the configured API cap. Advance by received rows so a lower server cap is safe too.
const PAGE_SIZE = 500;

/** Callers build a fresh, deterministically ordered query using the same request-scoped client. */
export async function readAll<T>(
  where: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw serviceError(where, error);
    if (data === null) throw new Error(`${where} failed: missing response data`);
    if (data.length === 0) return rows;
    rows.push(...data);
  }
}
