import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { movePosition } from "@/lib/services/positions";
import { isUuid } from "@/lib/validation/uuid";
import { reportUnexpected } from "@/lib/observability/reporter";
const schema = z.object({ wallet_id: z.uuid() }).strict();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
export const POST: APIRoute = async (context) => {
  if (context.request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!context.locals.user) return json({ ok: false, reason: "unauthenticated" }, 401);
  if (
    context.request.headers.get("origin") !== context.url.origin ||
    context.request.headers.get("sec-fetch-site") === "cross-site"
  )
    return json({ ok: false, reason: "forbidden" }, 403);
  if (!isUuid(context.params.id)) return json({ ok: false, reason: "not_found" }, 404);
  if (context.request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json")
    return json({ ok: false, reason: "invalid_request" }, 400);
  let body: unknown;
  try {
    const raw = await context.request.text();
    if (raw.length > 4096) return json({ ok: false, reason: "invalid_request" }, 400);
    body = JSON.parse(raw) as unknown;
  } catch {
    return json({ ok: false, reason: "invalid_request" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ ok: false, reason: "invalid_request" }, 400);
  try {
    const result = await movePosition(
      createClient(context.request.headers, context.cookies),
      context.params.id,
      parsed.data,
    );
    return json(
      result,
      result.ok ? 200 : result.reason === "not_found" ? 404 : result.reason === "unexpected" ? 503 : 409,
    );
  } catch (error) {
    reportUnexpected(error, { operation: "movePosition", route: "/dashboard/positions/[id]/move" });
    return json({ ok: false, reason: "unexpected" }, 503);
  }
};
export const ALL = POST;
