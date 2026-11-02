import type { APIContext, APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { createMarketPriceService } from "@/lib/services/market-prices";
import { reportUnexpected } from "@/lib/observability/reporter";

const downloadSchema = z.object({ positionIds: z.array(z.uuid()).min(1).max(50).optional() }).strict();
/**
 * Existing-position listing search/download/confirm are retired: a holding's stock identity is its
 * creation-time selection (FR-003/FR-014). Their routes stay so stale clients get a clear 409.
 */
type Action = "download" | "search" | "lookup" | "confirm";
const routes: Record<Action, string> = {
  download: "/dashboard/market-prices/download",
  search: "/dashboard/market-prices/listings/search",
  lookup: "/dashboard/market-prices/listings/download",
  confirm: "/dashboard/market-prices/listings/confirm",
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function status(reason: string) {
  if (reason === "not_found") return 404;
  if (reason === "invalid_request") return 400;
  if (reason === "cooldown" || reason === "refreshing") return 429;
  if (["incompatible_currency", "lookup_expired"].includes(reason)) return 409;
  return 503;
}
/** A JSON POST contract for Download prices; no GET handler can invoke provider work. */
export function marketPriceEndpoint(action: Action): APIRoute {
  return async (context: APIContext) => {
    const request = context.request;
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST", "cache-control": "no-store" } });
    if (!context.locals.user) return json({ ok: false, reason: "unauthenticated" }, 401);
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return json({ ok: false, reason: "forbidden" }, 403);
    if (request.headers.get("sec-fetch-site") === "cross-site") return json({ ok: false, reason: "forbidden" }, 403);
    // Selections cannot be edited; a wrong holding is deleted and recreated. No provider work.
    if (action !== "download") return json({ ok: false, reason: "selection_already_set" }, 409);
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
    try {
      const parsed = downloadSchema.safeParse(body);
      if (!parsed.success) return json({ ok: false, reason: "invalid_request" }, 400);
      const service = createMarketPriceService(createClient(request.headers, context.cookies), context.locals.user.id);
      const result = await service.download(parsed.data.positionIds, request.signal);
      return json(result, result.ok ? 200 : status(result.reason));
    } catch (error) {
      reportUnexpected(error, { operation: "marketPrices", route: routes[action] });
      return json({ ok: false, reason: "unavailable" }, 503);
    }
  };
}
