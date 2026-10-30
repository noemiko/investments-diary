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
  it.each(handlers)(
    "rejects malformed, oversized, non-JSON and forged-metadata requests at $path",
    async ({ handler, body, operation }) => {
      for (const bad of [
        {},
        { ...body, currency: "USD", exchange: "NMS", timezone: "UTC" },
        { ...body, positionId: "bad" },
      ]) {
        // Empty body is the deliberate all-owned-holdings contract only for download.
        if (operation === "download" && Object.keys(bad).length === 0) continue;
        expect((await call(handler, bad)).status).toBe(400);
      }
      expect((await call(handler, body, { raw: "{" })).status).toBe(400);
      expect((await call(handler, body, { raw: JSON.stringify("x".repeat(4097)) })).status).toBe(400);
      expect((await call(handler, body, { contentType: "text/plain" })).status).toBe(400);
      expect(service[operation]).not.toHaveBeenCalled();
    },
  );
  it.each(handlers)(
    "dispatches only the explicitly selected POST action at $path",
    async ({ handler, body, operation }) => {
      const response = await call(handler, body);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(service[operation]).toHaveBeenCalledOnce();
      for (const key of ["search", "download", "lookup", "confirm"] as const)
        if (key !== operation) expect(service[key]).not.toHaveBeenCalled();
      if (operation === "lookup")
        expect(service.lookup).toHaveBeenCalledWith(positionId, "AAPL", expect.any(AbortSignal));
      if (operation === "confirm") expect(service.confirm).toHaveBeenCalledExactlyOnceWith(positionId, lookupId);
    },
  );
  it("rejects invalid query and identifier bounds before a provider call", async () => {
    expect((await call(search, { positionId, query: "a" })).status).toBe(400);
    expect((await call(search, { positionId, query: "a".repeat(101) })).status).toBe(400);
    expect((await call(lookup, { positionId, symbol: "https://provider.test/private" })).status).toBe(400);
    expect((await call(download, { positionIds: Array.from({ length: 51 }, () => positionId) })).status).toBe(400);
    expect(service.search).not.toHaveBeenCalled();
    expect(service.lookup).not.toHaveBeenCalled();
    expect(service.download).not.toHaveBeenCalled();
  });
  it("maps foreign-position and incompatible-currency service results without leaking metadata", async () => {
    service.lookup
      .mockResolvedValueOnce({ ok: false, reason: "not_found" })
      .mockResolvedValueOnce({ ok: false, reason: "incompatible_currency" });
    expect((await call(lookup, { positionId, symbol: "PKO.WA" })).status).toBe(404);
    const incompatible = await call(lookup, { positionId, symbol: "PKO.WA" });
    expect(incompatible.status).toBe(409);
    expect(await incompatible.json()).toEqual({ ok: false, reason: "incompatible_currency" });
  });
  it("returns recoverable safe unavailability and retry state, reporting unexpected failures once", async () => {
    service.lookup.mockResolvedValueOnce({ ok: false, reason: "cooldown", retryAfter: "2026-10-30T13:00:00Z" });
    const cooldown = await call(lookup, { positionId, symbol: "PKO.WA" });
    expect(cooldown.status).toBe(429);
    expect(await cooldown.json()).toEqual({ ok: false, reason: "cooldown", retryAfter: "2026-10-30T13:00:00Z" });
    service.search.mockRejectedValue(new Error("PRIVATE_PROVIDER_URL_AND_COOKIE"));
    const unavailable = await call(search, { positionId, query: "Apple" });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("PRIVATE_PROVIDER");
    expect(reportUnexpected).toHaveBeenCalledOnce();
  });
});
