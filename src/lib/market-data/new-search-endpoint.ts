import type { APIContext } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { json, status } from "@/lib/market-data/endpoint";
import { searchMarketSelections } from "@/lib/services/market-selections";
import { reportUnexpected } from "@/lib/observability/reporter";

const searchSchema = z.object({ walletId: z.uuid(), query: z.string().trim().min(2).max(100) }).strict();

/**
 * In-place stock search for the new-investment form. The same service and receipts as the native
 * `search_listing` POST on /dashboard/new; saving still re-reads the receipt server-side.
 */
export async function newPositionSearch(context: APIContext): Promise<Response> {
  const request = context.request;
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST", "cache-control": "no-store" } });
  const user = context.locals.user;
  if (!user) return json({ ok: false, reason: "unauthenticated" }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ ok: false, reason: "forbidden" }, 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ ok: false, reason: "forbidden" }, 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json")
    return json({ ok: false, reason: "invalid_request" }, 400);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ ok: false, reason: "invalid_request" }, 400);
    body = JSON.parse(raw) as unknown;
  } catch {
    return json({ ok: false, reason: "invalid_request" }, 400);
  }
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, reason: "invalid_request" }, 400);
  try {
    const result = await searchMarketSelections(
      createClient(request.headers, context.cookies),
      user.id,
      parsed.data.walletId,
      parsed.data.query,
      request.signal,
    );
    if (result.ok) return json({ ok: true, choices: result.choices });
    // Only the reason crosses the boundary: no provider status or retry metadata.
    return json({ ok: false, reason: result.reason }, status(result.reason));
  } catch (error) {
    reportUnexpected(error, { operation: "marketPrices", route: "/dashboard/new/search" });
    return json({ ok: false, reason: "unavailable" }, 503);
  }
}
