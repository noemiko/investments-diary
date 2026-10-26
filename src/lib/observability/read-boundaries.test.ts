import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { beforeEach, expect, it, vi } from "vitest";
import Dashboard from "@/pages/dashboard.astro";
import NewPosition from "@/pages/dashboard/new.astro";
import Deleted from "@/pages/dashboard/deleted.astro";
import Position from "@/pages/dashboard/positions/[id].astro";
import Wallets from "@/pages/dashboard/wallets/index.astro";
import Wallet from "@/pages/dashboard/wallets/[id].astro";
import * as positions from "@/lib/services/positions";
import * as wallets from "@/lib/services/wallets";
import { reportUnexpected } from "@/lib/observability/reporter";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/observability/reporter", () => ({ reportUnexpected: vi.fn() }));
vi.mock("@/lib/services/positions", () => ({
  listPositions: vi.fn(),
  listCategories: vi.fn(),
  listConfrontationPositions: vi.fn(),
  listDeletedPositions: vi.fn(),
  getPosition: vi.fn(),
  updatePositionPrice: vi.fn(),
  createPosition: vi.fn(),
}));
vi.mock("@/lib/services/wallets", () => ({
  listWallets: vi.fn(),
  listWalletPositions: vi.fn(),
  getWallet: vi.fn(),
  updateWallet: vi.fn(),
}));
const id = "10000000-0000-4000-8000-000000000001";
const locals: App.Locals = {
  user: {
    id,
    email: "private@example.test",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(positions.listPositions).mockResolvedValue([]);
  vi.mocked(positions.listCategories).mockResolvedValue([]);
  vi.mocked(positions.listConfrontationPositions).mockResolvedValue([]);
  vi.mocked(positions.listDeletedPositions).mockResolvedValue([]);
  vi.mocked(wallets.listWallets).mockResolvedValue([]);
  vi.mocked(wallets.listWalletPositions).mockResolvedValue([]);
  vi.mocked(wallets.getWallet).mockResolvedValue({ id, name: "Wallet", starting_value: "0" });
});
const cases = [
  {
    page: Dashboard,
    fail: positions.listPositions,
    operation: "listPositions",
    path: "/dashboard",
    fallback: "Your positions could not be loaded",
  },
  {
    page: NewPosition,
    fail: positions.listCategories,
    operation: "listCategories",
    path: "/dashboard/new",
    fallback: "Your categories could not be loaded",
  },
  {
    page: NewPosition,
    fail: wallets.listWallets,
    operation: "listWallets",
    path: "/dashboard/new",
    fallback: "Your wallets could not be loaded",
  },
  {
    page: NewPosition,
    fail: positions.listConfrontationPositions,
    operation: "listConfrontationPositions",
    path: "/dashboard/new",
    fallback: "Your earlier positions could not be loaded",
  },
  {
    page: Deleted,
    fail: positions.listDeletedPositions,
    operation: "listDeletedPositions",
    path: "/dashboard/deleted",
    fallback: "Your deleted positions could not be loaded",
  },
  {
    page: Position,
    fail: positions.getPosition,
    operation: "getPosition",
    path: `/dashboard/positions/${id}`,
    fallback: "This position could not be loaded",
  },
  {
    page: Wallets,
    fail: wallets.listWalletPositions,
    operation: "loadWallets",
    path: "/dashboard/wallets",
    fallback: "Your wallets could not be loaded",
  },
  {
    page: Wallet,
    fail: wallets.getWallet,
    operation: "getWallet",
    path: `/dashboard/wallets/${id}`,
    fallback: "This wallet could not be loaded",
  },
  {
    page: Wallet,
    fail: positions.listPositions,
    operation: "listPositions",
    path: `/dashboard/wallets/${id}`,
    fallback: "This wallet's investments and value could not be loaded",
  },
];
it.each(cases)(
  "reports $operation at $path once and keeps the fallback",
  async ({ page, fail, operation, path, fallback }) => {
    const error = new Error("private sentinel");
    vi.mocked(fail).mockRejectedValue(error);
    const container = await AstroContainer.create();
    container.addServerRenderer({ renderer: reactRenderer });
    const response = await container.renderToResponse(page, {
      request: new Request(
        `http://localhost${path}`,
        page === NewPosition
          ? {
              method: "POST",
              body: new URLSearchParams({
                instrument: "Private instrument",
                reason_text: "Preserved private reasoning",
                category_id: id,
              }),
            }
          : undefined,
      ),
      params: { id },
      locals,
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(fallback);
    if (page === NewPosition) {
      expect(html).toContain("Preserved private reasoning");
      expect(html).toContain("Private instrument");
    }
    expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(error, { operation });
  },
);

it("can save after a failed confrontation read", async () => {
  vi.mocked(positions.listConfrontationPositions).mockRejectedValue(new Error("private"));
  const container = await AstroContainer.create();
  container.addServerRenderer({ renderer: reactRenderer });
  await container.renderToResponse(NewPosition, { request: new Request("http://localhost/dashboard/new"), locals });
  expect(reportUnexpected).toHaveBeenCalledOnce();
  vi.mocked(positions.createPosition).mockResolvedValue({ ok: true, id });
  const response = await container.renderToResponse(NewPosition, {
    request: new Request("http://localhost/dashboard/new", {
      method: "POST",
      body: new URLSearchParams({
        instrument: "Saved",
        reason_text: "Private reason",
        category_id: id,
        wallet_id: id,
        buy_date: "2026-01-01",
        buy_price: "10",
      }),
    }),
    locals,
  });
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/dashboard");
  expect(positions.createPosition).toHaveBeenCalledOnce();
  expect(reportUnexpected).toHaveBeenCalledOnce();
});
