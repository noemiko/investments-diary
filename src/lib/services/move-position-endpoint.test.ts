import type { APIContext } from "astro";
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/pages/dashboard/positions/[id]/move";
import { movePosition } from "./positions";
import { createClient } from "@/lib/supabase";
vi.mock("./positions", () => ({ movePosition: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/observability/reporter", () => ({ reportUnexpected: vi.fn() }));
const id = "00000000-0000-4000-8000-000000000001",
  target = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(movePosition).mockResolvedValue({ ok: true });
});
async function call(body: unknown, options: { user?: boolean; origin?: string; method?: string } = {}) {
  const url = new URL(`https://diary.test/dashboard/positions/${id}/move`);
  const method = options.method ?? "POST";
  return await POST({
    url,
    params: { id },
    locals: { user: options.user === false ? null : { id } },
    cookies: {},
    request: new Request(url, {
      method,
      headers: { "content-type": "application/json", origin: options.origin ?? url.origin },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    }),
  } as unknown as APIContext);
}
it("requires authentication, same origin and POST before any service access", async () => {
  const body = { wallet_id: target };
  expect((await call(body, { user: false })).status).toBe(401);
  expect((await call(body, { origin: "https://attacker.test" })).status).toBe(403);
  expect((await call(body, { method: "GET" })).status).toBe(405);
  expect(createClient).not.toHaveBeenCalled();
  expect(movePosition).not.toHaveBeenCalled();
});
it("rejects malformed input and maps owner/denomination outcomes without leaking facts", async () => {
  expect((await call({ wallet_id: "bad" })).status).toBe(400);
  expect(movePosition).not.toHaveBeenCalled();
  vi.mocked(movePosition)
    .mockResolvedValueOnce({ ok: false, reason: "not_found" })
    .mockResolvedValueOnce({ ok: false, reason: "incompatible_currency" });
  const body = { wallet_id: target };
  expect((await call(body)).status).toBe(404);
  const incompatible = await call(body);
  expect(incompatible.status).toBe(409);
  expect(await incompatible.json()).toEqual({ ok: false, reason: "incompatible_currency" });
});
