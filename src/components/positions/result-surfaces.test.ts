import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/dashboard.astro";
import PositionPage from "@/pages/dashboard/positions/[id].astro";
import WalletList from "@/pages/dashboard/wallets/index.astro";
import WalletPage from "@/pages/dashboard/wallets/[id].astro";
import { ConfrontationPanel } from "@/components/positions/ConfrontationPanel";
import { getPosition, listPositions } from "@/lib/services/positions";
import { getWallet, listWalletPositions, listWallets } from "@/lib/services/wallets";
import type { PositionDetail, Wallet } from "@/types";

// Only I/O is replaced: real page/component wiring, arithmetic, formatting and dates execute.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/positions", () => ({
  listPositions: vi.fn(),
  getPosition: vi.fn(),
  updatePositionPrice: vi.fn(),
}));
vi.mock("@/lib/services/wallets", () => ({
  listWallets: vi.fn(),
  getWallet: vi.fn(),
  listWalletPositions: vi.fn(),
  updateWallet: vi.fn(),
}));

const wallets: Wallet[] = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Long term", starting_value: "1000" },
  { id: "10000000-0000-4000-8000-000000000002", name: "Other", starting_value: "100" },
  { id: "10000000-0000-4000-8000-000000000003", name: "Empty", starting_value: "0" },
];
const gain: PositionDetail = {
  id: "20000000-0000-4000-8000-000000000001",
  instrument: "Gain",
  buy_price: "50",
  current_price: "60",
  quantity: "10",
  buy_date: "2026-02-03",
  price_date: "2026-10-10",
  wallet_id: wallets[0].id,
  wallet_name: wallets[0].name,
  category_name: "Growth",
  broker_label: null,
  reason_text: "Independent gain fixture",
};
const loss: PositionDetail = {
  ...gain,
  id: "20000000-0000-4000-8000-000000000002",
  instrument: "Loss",
  buy_price: "100",
  current_price: "80",
  quantity: "2",
  price_date: "2026-10-01",
};
const percentOnly: PositionDetail = {
  ...gain,
  id: "20000000-0000-4000-8000-000000000003",
  instrument: "Percent only",
  buy_price: "10",
  current_price: "15",
  quantity: null,
  buy_date: "2025-01-01",
  price_date: "2026-01-01",
};
const unpriced: PositionDetail = {
  ...gain,
  id: "20000000-0000-4000-8000-000000000004",
  instrument: "Unpriced",
  current_price: null,
  price_date: null,
};
const other: PositionDetail = {
  ...gain,
  id: "20000000-0000-4000-8000-000000000005",
  instrument: "Other loss",
  buy_price: "10",
  current_price: "8",
  quantity: "5",
  price_date: "2026-09-15",
  wallet_id: wallets[1].id,
  wallet_name: wallets[1].name,
};
const positions = [gain, loss, percentOnly, unpriced, other];
const locals: App.Locals = {
  user: {
    id: "30000000-0000-4000-8000-000000000001",
    email: "render@example.test",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listPositions).mockImplementation((_client, walletId) =>
    Promise.resolve(
      walletId === undefined ? positions : positions.filter((position) => position.wallet_id === walletId),
    ),
  );
  vi.mocked(getPosition).mockImplementation((_client, id) =>
    Promise.resolve(positions.find((position) => position.id === id) ?? null),
  );
  vi.mocked(listWallets).mockResolvedValue(wallets);
  vi.mocked(getWallet).mockImplementation((_client, id) =>
    Promise.resolve(wallets.find((wallet) => wallet.id === id) ?? null),
  );
  vi.mocked(listWalletPositions).mockResolvedValue(positions);
});

async function container() {
  const instance = await AstroContainer.create();
  instance.addServerRenderer({ renderer: reactRenderer });
  return instance;
}

function text(html: string): string {
  return html
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Assert inside the row selected by its actual record link, never somewhere on the whole page. */
function row(html: string, href: string): string {
  const found = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)?.find((candidate) => candidate.includes(`href="${href}"`));
  if (!found) throw new Error(`Missing rendered row for ${href}`);
  return found;
}

function positionResultText(html: string): string {
  // The detail result has its own paragraph; its price date must not be satisfied by the separate price section.
  const paragraph = /<p\b[^>]*class="text-lg"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1];
  if (paragraph === undefined) throw new Error("Missing position result paragraph");
  return text(paragraph);
}

describe("rendered position surfaces", () => {
  it("keeps each dashboard result and date in its own row", async () => {
    const html = await (
      await container()
    ).renderToString(Dashboard, { request: new Request("http://localhost/dashboard"), locals });
    const gainRow = row(html, `/dashboard/positions/${gain.id}`);
    const lossRow = row(html, `/dashboard/positions/${loss.id}`);
    expect(text(gainRow)).toContain("+20.00% as of Oct 10, 2026");
    expect(text(gainRow)).not.toContain("as of Oct 1, 2026");
    expect(text(lossRow)).toContain("-20.00% as of Oct 1, 2026");
    expect(text(lossRow)).not.toContain("as of Oct 10, 2026");
    expect(text(row(html, `/dashboard/positions/${percentOnly.id}`))).toContain("+50.00% as of Jan 1, 2026");
    const unpricedRow = text(row(html, `/dashboard/positions/${unpriced.id}`));
    expect(unpricedRow).toContain("No price yet");
    expect(unpricedRow).not.toContain("as of");
    expect(unpricedRow).not.toContain("%");
  });

  it.each([
    { position: gain, expected: "+20.00% as of Oct 10, 2026" },
    { position: loss, expected: "-20.00% as of Oct 1, 2026" },
    { position: percentOnly, expected: "+50.00% as of Jan 1, 2026" },
    { position: unpriced, expected: "No price yet" },
  ])("renders the detail result for $position.instrument", async ({ position, expected }) => {
    const html = await (
      await container()
    ).renderToString(PositionPage, {
      request: new Request(`http://localhost/dashboard/positions/${position.id}`),
      params: { id: position.id },
      locals,
    });
    expect(positionResultText(html)).toBe(expected);
    expect(positionResultText(html)).not.toContain("Feb 3, 2026");
  });

  it("keeps all eight decimal places in rendered detail prices and quantities", async () => {
    vi.mocked(getPosition).mockResolvedValue({
      ...gain,
      buy_price: "123456789012.12345678",
      current_price: "123456789012.12345678",
      quantity: "0.00000001",
    });
    const html = await (
      await container()
    ).renderToString(PositionPage, {
      request: new Request(`http://localhost/dashboard/positions/${gain.id}`),
      params: { id: gain.id },
      locals,
    });
    expect(positionResultText(html)).toBe("0.00% as of Oct 10, 2026");
    expect(text(html)).toContain("Buy price 123,456,789,012.12345678");
    expect(text(html)).toContain("Quantity 0.00000001");
    expect(text(html)).toContain("Currently 123,456,789,012.12345678 as of Oct 10, 2026");
  });

  it("renders real React confrontation results within their own history entries", () => {
    const html = renderToStaticMarkup(
      createElement(ConfrontationPanel, {
        state: { kind: "history", positions: positions.map((position) => ({ ...position, category_id: "reason" })) },
      }),
    );
    const items = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
    const item = (id: string) => {
      const found = items.find((candidate) => candidate.includes(`data-confrontation-position-id="${id}"`));
      if (!found) throw new Error(`Missing history item ${id}`);
      return text(found);
    };
    expect(item(gain.id)).toContain("+20.00% as of Oct 10, 2026");
    expect(item(gain.id)).not.toContain("as of Oct 1, 2026");
    expect(item(loss.id)).toContain("-20.00% as of Oct 1, 2026");
    expect(item(percentOnly.id)).toContain("+50.00% as of Jan 1, 2026");
    expect(item(unpriced.id)).toContain("No price yet");
    expect(item(unpriced.id)).not.toContain("as of");
    expect(item(unpriced.id)).not.toContain("%");
  });
});

describe("rendered wallet surfaces", () => {
  it("associates each total, signed change, exclusions and oldest counted date with its wallet", async () => {
    const html = await (
      await container()
    ).renderToString(WalletList, { request: new Request("http://localhost/dashboard/wallets"), locals });
    const first = text(row(html, `/dashboard/wallets/${wallets[0].id}`));
    const second = text(row(html, `/dashboard/wallets/${wallets[1].id}`));
    expect(first).toBe(
      "Long term 1,000.00 1,060.00 +60.00 (+6.00%) as of Oct 1, 2026 2 not counted (no quantity or no price)",
    );
    expect(second).toBe("Other 100.00 90.00 -10.00 (-10.00%) as of Sep 15, 2026");
    expect(first).not.toContain("as of Jan 1, 2026");
    expect(text(row(html, `/dashboard/wallets/${wallets[2].id}`))).toBe("Empty 0.00 0.00 0.00 No priced positions");
  });

  it("renders the same exact total and its member results on wallet detail", async () => {
    const html = await (
      await container()
    ).renderToString(WalletPage, {
      request: new Request(`http://localhost/dashboard/wallets/${wallets[0].id}`),
      params: { id: wallets[0].id },
      locals,
    });
    // Everything before Investments is the actual WalletValue output, not member dates below it.
    const summary = text(html.split("<section")[0]);
    expect(summary).toContain(
      "Starting value 1,000.00 Current value 1,060.00 Change +60.00 (+6.00%) as of Oct 1, 2026 2 not counted (no quantity or no price)",
    );
    expect(summary).not.toContain("as of Jan 1, 2026");
    expect(text(row(html, `/dashboard/positions/${gain.id}`))).toContain("+20.00% as of Oct 10, 2026");
    expect(text(row(html, `/dashboard/positions/${loss.id}`))).toContain("-20.00% as of Oct 1, 2026");
    expect(html).not.toContain(`/dashboard/positions/${other.id}`);
    expect(html).toMatch(/name="starting_value"[^>]*value="1000"/);
  });

  it("renders an empty zero-starting wallet without a percentage or a fake price date", async () => {
    const html = await (
      await container()
    ).renderToString(WalletPage, {
      request: new Request(`http://localhost/dashboard/wallets/${wallets[2].id}`),
      params: { id: wallets[2].id },
      locals,
    });
    const summary = text(html.split("<section")[0]);
    expect(summary).toContain("Starting value 0.00 Current value 0.00 Change 0.00 No priced positions");
    expect(summary).not.toContain("%");
    expect(summary).not.toContain("as of");
  });
});
