import type { APIContext, APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as download, ALL as downloadOther } from "@/pages/dashboard/market-prices/download";
import { POST as search, ALL as searchOther } from "@/pages/dashboard/market-prices/listings/search";
import { POST as lookup, ALL as lookupOther } from "@/pages/dashboard/market-prices/listings/download";
import { POST as confirm, ALL as confirmOther } from "@/pages/dashboard/market-prices/listings/confirm";
import { createMarketPriceService } from "@/lib/services/market-prices";
import { createClient } from "@/lib/supabase";
import { reportUnexpected } from "@/lib/observability/reporter";
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/market-prices", () => ({ createMarketPriceService: vi.fn() }));
vi.mock("@/lib/observability/reporter", () => ({ reportUnexpected: vi.fn() }));
const positionId = "00000000-0000-4000-8000-000000000001";
const lookupId = "00000000-0000-4000-8000-000000000002";
const owner = "00000000-0000-4000-8000-000000000003";
const handlers = [
  {
    path: "/dashboard/market-prices/download",
    handler: download,
    other: downloadOther,
    body: { positionIds: [positionId] },
    operation: "download",
  },
  {
    path: "/dashboard/market-prices/listings/search",
    handler: search,
    other: searchOther,
    body: { positionId, query: "Apple" },
    operation: "search",
  },
  {
    path: "/dashboard/market-prices/listings/download",
    handler: lookup,
    other: lookupOther,
    body: { positionId, symbol: "aapl" },
    operation: "lookup",
  },
  {
    path: "/dashboard/market-prices/listings/confirm",
    handler: confirm,
    other: confirmOther,
    body: { positionId, lookupId },
    operation: "confirm",
  },
] as const;
const service = { download: vi.fn(), search: vi.fn(), lookup: vi.fn(), confirm: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  for (const operation of Object.values(service)) operation.mockResolvedValue({ ok: true });
  vi.mocked(createMarketPriceService).mockReturnValue(service);
});
async function call(
  handler: APIRoute,
  body: unknown,
  options: {
    method?: string;
    user?: boolean;
    origin?: string | null;
    site?: string;
    raw?: string;
    contentType?: string;
  } = {},
) {
  const method = options.method ?? "POST";
  const headers = new Headers({ "content-type": options.contentType ?? "application/json" });
  if (options.origin !== null) headers.set("origin", options.origin ?? "https://diary.test");
  if (options.site) headers.set("sec-fetch-site", options.site);
  const request = new Request("https://diary.test/dashboard/market-prices/action", {
    method,
    headers,
    ...(["GET", "HEAD"].includes(method) ? {} : { body: options.raw ?? JSON.stringify(body) }),
  });
  const context = {
    request,
    locals: { user: options.user === false ? null : { id: owner } },
    cookies: {},
  } as unknown as APIContext;
  return await handler(context);
}
describe("authenticated explicit market-price endpoints", () => {
  it.each(handlers)(
    "requires authentication at $path before building any provider service",
    async ({ handler, body }) => {
      const response = await call(handler, body, { user: false });
      expect(response.status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
      expect(createMarketPriceService).not.toHaveBeenCalled();
    },
  );
  it.each(handlers)("rejects foreign and absent origins at $path", async ({ handler, body }) => {
    for (const origin of ["https://attacker.test", null]) {
      expect((await call(handler, body, { origin })).status).toBe(403);
    }
    expect((await call(handler, body, { site: "cross-site" })).status).toBe(403);
    expect(createMarketPriceService).not.toHaveBeenCalled();
  });
  it.each(handlers)("GET/HEAD/reload cannot trigger provider actions at $path", async ({ handler, other, body }) => {
    for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
      expect((await call(other, body, { method })).status).toBe(405);
      expect((await call(handler, body, { method })).headers.get("allow")).toBe("POST");
    }
    expect(createMarketPriceService).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized, non-JSON and forged-metadata download requests", async () => {
    for (const bad of [{ positionIds: [positionId], currency: "USD" }, { positionIds: ["bad"] }, { positionIds: [] }])
      expect((await call(download, bad)).status).toBe(400);
    expect((await call(download, {}, { raw: "{" })).status).toBe(400);
    expect((await call(download, {}, { raw: JSON.stringify("x".repeat(4097)) })).status).toBe(400);
    expect((await call(download, {}, { contentType: "text/plain" })).status).toBe(400);
    expect((await call(download, { positionIds: Array.from({ length: 51 }, () => positionId) })).status).toBe(400);
    expect(service.download).not.toHaveBeenCalled();
  });
  it("dispatches only an explicit Download prices POST, including the all-owned-holdings body", async () => {
    for (const body of [{ positionIds: [positionId] }, {}]) {
      const response = await call(download, body);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(service.download).toHaveBeenNthCalledWith(1, [positionId], expect.any(AbortSignal));
    expect(service.download).toHaveBeenNthCalledWith(2, undefined, expect.any(AbortSignal));
    for (const key of ["search", "lookup", "confirm"] as const) expect(service[key]).not.toHaveBeenCalled();
  });
  it.each(handlers.filter(({ operation }) => operation !== "download"))(
    "rejects existing-position listing changes at $path with selection_already_set and no provider work",
    async ({ handler, body }) => {
      for (const request of [body, {}]) {
        const response = await call(handler, request);
        expect(response.status).toBe(409);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ ok: false, reason: "selection_already_set" });
      }
      expect(createClient).not.toHaveBeenCalled();
      expect(createMarketPriceService).not.toHaveBeenCalled();
    },
  );
  it("maps foreign-position service results without leaking metadata", async () => {
    service.download.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const missing = await call(download, { positionIds: [positionId] });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ ok: false, reason: "not_found" });
  });
  it("returns recoverable safe unavailability and retry state, reporting unexpected failures once", async () => {
    service.download.mockResolvedValueOnce({ ok: false, reason: "cooldown", retryAfter: "2026-10-30T13:00:00Z" });
    const cooldown = await call(download, {});
    expect(cooldown.status).toBe(429);
    expect(await cooldown.json()).toEqual({ ok: false, reason: "cooldown", retryAfter: "2026-10-30T13:00:00Z" });
    service.download.mockRejectedValue(new Error("PRIVATE_PROVIDER_URL_AND_COOKIE"));
    const unavailable = await call(download, {});
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("PRIVATE_PROVIDER");
    expect(reportUnexpected).toHaveBeenCalledOnce();
  });
});
