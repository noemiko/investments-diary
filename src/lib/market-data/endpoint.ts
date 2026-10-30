import type { APIContext, APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { createMarketPriceService } from "@/lib/services/market-prices";
import { reportUnexpected } from "@/lib/observability/reporter";

const uuid = z.uuid();
const schemas = {
  download: z.object({ positionIds: z.array(uuid).min(1).max(50).optional() }).strict(),
  search: z.object({ positionId: uuid, query: z.string().trim().min(2).max(100) }).strict(),
  lookup: z
    .object({
      positionId: uuid,
      symbol: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9.^=-]{0,49}$/),
    })
    .strict(),
  confirm: z.object({ positionId: uuid, lookupId: uuid }).strict(),
};
type Action = keyof typeof schemas;
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
  if (["currency_required", "incompatible_currency", "lookup_expired"].includes(reason)) return 409;
  return 503;
}
/** A JSON POST contract for the Phase 4 buttons; no GET handler can invoke provider work. */
export function marketPriceEndpoint(action: Action): APIRoute {
  return async (context: APIContext) => {
    const request = context.request;
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST", "cache-control": "no-store" } });
    if (!context.locals.user) return json({ ok: false, reason: "unauthenticated" }, 401);
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
    try {
      const client = createClient(request.headers, context.cookies);
      const service = createMarketPriceService(client, context.locals.user.id);
      const signal = request.signal;
      // Parse separately so each action keeps its exact, strict body type.
      let result;
      if (action === "download") {
        const parsed = schemas.download.safeParse(body);
        if (!parsed.success) return json({ ok: false, reason: "invalid_request" }, 400);
        result = await service.download(parsed.data.positionIds, signal);
      } else if (action === "search") {
        const parsed = schemas.search.safeParse(body);
        if (!parsed.success) return json({ ok: false, reason: "invalid_request" }, 400);
        result = await service.search(parsed.data.positionId, parsed.data.query, signal);
      } else if (action === "lookup") {
        const parsed = schemas.lookup.safeParse(body);
        if (!parsed.success) return json({ ok: false, reason: "invalid_request" }, 400);
        result = await service.lookup(parsed.data.positionId, parsed.data.symbol, signal);
      } else {
        const parsed = schemas.confirm.safeParse(body);
        if (!parsed.success) return json({ ok: false, reason: "invalid_request" }, 400);
        result = await service.confirm(parsed.data.positionId, parsed.data.lookupId);
      }
      return json(result, result.ok ? 200 : status(result.reason));
    } catch (error) {
      reportUnexpected(error, { operation: "marketPrices", route: routes[action] });
      return json({ ok: false, reason: "unavailable" }, 503);
    }
  };
}
