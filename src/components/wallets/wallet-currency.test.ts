import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { beforeEach, expect, it, vi } from "vitest";
import NewWallet from "@/pages/dashboard/wallets/new.astro";
import { createWallet } from "@/lib/services/wallets";
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/wallets", () => ({ createWallet: vi.fn() }));
const locals: App.Locals = {
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "wallet@example.test",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  },
};
beforeEach(() => vi.resetAllMocks());
async function submit(fields: Record<string, string>) {
  const container = await AstroContainer.create();
  container.addServerRenderer({ renderer: reactRenderer });
  return container.renderToResponse(NewWallet, {
    request: new Request("http://localhost/dashboard/wallets/new", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
    locals,
  });
}
it("requires explicit currency confirmation before creating a new wallet", async () => {
  const response = await submit({ name: "My wallet", starting_value: "1000", currency: "EUR" });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Confirm that all recorded amounts use this currency");
  expect(createWallet).not.toHaveBeenCalled();
});
it("sends confirmed denomination and exact amounts, retaining selection after a failed save", async () => {
  vi.mocked(createWallet).mockResolvedValue({ ok: false, error: "name_taken" });
  const response = await submit({
    name: "My wallet",
    starting_value: "1 000,12345678",
    currency: "EUR",
    currency_attested: "on",
  });
  expect(createWallet).toHaveBeenCalledExactlyOnceWith({}, locals.user?.id, {
    name: "My wallet",
    starting_value: "1000.12345678",
    currency: "EUR",
    currency_attested: true,
  });
  const html = await response.text();
  expect(html).toContain('value="1 000,12345678"');
  expect(html).toMatch(/<option[^>]*value="EUR"[^>]*selected/);
  expect(/<input[^>]*name="currency_attested"[^>]*>/.exec(html)?.[0]).toContain("checked");
  expect(html).toContain("You already have a wallet with this name");
});
