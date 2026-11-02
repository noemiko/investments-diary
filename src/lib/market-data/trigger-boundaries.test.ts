import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { afterEach, expect, it, vi } from "vitest";
import Dashboard from "@/pages/dashboard.astro";
import { createYahooMarketData } from "./yahoo";
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/positions", () => ({ listPositions: vi.fn(() => Promise.resolve([])) }));
vi.mock("./yahoo", () => ({ createYahooMarketData: vi.fn(), YAHOO_BATCH_SIZE: 50, YAHOO_REQUEST_BUDGET_MS: 5000 }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("opening and reloading the dashboard never starts provider work or a periodic refresh", async () => {
  const interval = vi.spyOn(globalThis, "setInterval");
  const container = await AstroContainer.create();
  container.addServerRenderer({ renderer: reactRenderer });
  for (let i = 0; i < 2; i++) {
    const response = await container.renderToResponse(Dashboard, {
      request: new Request("http://localhost/dashboard"),
      locals: { user: null },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Your positions");
  }
  expect(interval).not.toHaveBeenCalled();
  interval.mockRestore();
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
  expect(createYahooMarketData).not.toHaveBeenCalled();
});
