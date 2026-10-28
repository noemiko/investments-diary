import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import { closePosition, updatePositionPrice } from "@/lib/services/positions";
import { reportUnexpected } from "@/lib/observability/reporter";
vi.mock("@/lib/observability/reporter", async (original) => ({
  ...(await original<object>()),
  reportUnexpected: vi.fn(),
}));

it.each(["close", "price"])("%s writes only its pair and requires an open active id", async (operation) => {
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    expect(url.searchParams.get("id")).toBe("eq.position");
    for (const field of ["deleted_at", "sell_price", "sell_date"]) expect(url.searchParams.get(field)).toBe("is.null");
    expect(url.searchParams.get("select")).toBe("id");
    expect(init?.method).toBe("PATCH");
    if (typeof init?.body !== "string") throw new Error("Expected JSON request body");
    expect(JSON.parse(init.body)).toEqual(
      operation === "close"
        ? { sell_price: "999999999999.99999999", sell_date: "2026-01-02" }
        : { current_price: "60", price_date: "2026-01-03" },
    );
    return Promise.resolve(new Response('[{"id":"position"}]', { headers: { "content-type": "application/json" } }));
  });
  const client = createClient<ApiDatabase>("http://localhost:54321", "fixture", { global: { fetch } });
  expect(
    await (operation === "close"
      ? closePosition(client, "position", { sell_price: "999999999999.99999999", sell_date: "2026-01-02" })
      : updatePositionPrice(client, "position", { current_price: "60", price_date: "2026-01-03" })),
  ).toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("reports a thrown close failure once", async () => {
  vi.mocked(reportUnexpected).mockClear();
  const failure = new Error("private transport");
  const client = {
    from: () => {
      throw failure;
    },
  } as unknown as Parameters<typeof closePosition>[0];
  expect(await closePosition(client, "id", { sell_price: "0", sell_date: "2026-01-01" })).toEqual({
    ok: false,
    error: "unexpected",
  });
  expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(failure, { operation: "closePosition" });
});
