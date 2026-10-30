import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/dashboard.astro";
import PositionPage from "@/pages/dashboard/positions/[id].astro";
import WalletList from "@/pages/dashboard/wallets/index.astro";
import WalletPage from "@/pages/dashboard/wallets/[id].astro";
import { ConfrontationPanel } from "@/components/positions/ConfrontationPanel";
import { closePosition, getPosition, listPositions, updatePositionPrice } from "@/lib/services/positions";
import { listWalletSnapshots } from "@/lib/services/wallet-snapshots";
import { getWallet, listWalletPositions, listWallets } from "@/lib/services/wallets";
import type { PositionDetail, Wallet } from "@/types";

vi.mock("@/lib/services/wallet-snapshots", () => ({ listWalletSnapshots: vi.fn().mockResolvedValue([]) }));
// Only I/O is replaced: real page/component wiring, arithmetic, formatting and dates execute.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/positions", () => ({
  listPositions: vi.fn(),
  getPosition: vi.fn(),
  updatePositionPrice: vi.fn(),
  closePosition: vi.fn(),
}));
vi.mock("@/lib/services/wallets", () => ({
  listWallets: vi.fn(),
  getWallet: vi.fn(),
  listWalletPositions: vi.fn(),
  updateWallet: vi.fn(),
}));

const wallets: Wallet[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Long term",
    starting_value: "1000",
    currency: null,
    currency_confirmed_at: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Other",
    starting_value: "100",
    currency: null,
    currency_confirmed_at: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Empty",
    starting_value: "0",
    currency: null,
    currency_confirmed_at: null,
  },
];
const gain: PositionDetail = {
  id: "20000000-0000-4000-8000-000000000001",
  instrument: "Gain",
  sell_price: null,
  sell_date: null,
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
  vi.mocked(listWalletSnapshots).mockResolvedValue([]);
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
      "Long term 1,000.00 1,060.00 +60.00 (+6.00%) Open prices as of Oct 1, 2026 2 not counted (no quantity or no current price for an open position)",
    );
    expect(second).toBe("Other 100.00 90.00 -10.00 (-10.00%) Open prices as of Sep 15, 2026");
    expect(first).not.toContain("as of Jan 1, 2026");
    expect(text(row(html, `/dashboard/wallets/${wallets[2].id}`))).toBe("Empty 0.00 0.00 0.00 No counted results");
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
      "Starting value 1,000.00 Current value 1,060.00 Change +60.00 (+6.00%) Live total from your latest recorded prices Realised gain/loss 0.00 Open gain/loss +60.00 Open prices as of Oct 1, 2026 2 not counted (no quantity or no current price for an open position)",
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
    expect(summary).toContain(
      "Starting value 0.00 Current value 0.00 Change 0.00 Live total from your latest recorded prices Realised gain/loss 0.00 Open gain/loss 0.00 No counted results",
    );
    expect(summary).not.toContain("%");
    expect(summary).not.toContain("as of");
  });
});

describe("closed result wiring", () => {
  const closed: PositionDetail = {
    ...gain,
    sell_price: "60",
    sell_date: "2026-09-01",
    current_price: "80",
    price_date: "2026-10-10",
  };
  beforeEach(() => {
    vi.mocked(getPosition).mockResolvedValue(closed);
    vi.mocked(listPositions).mockResolvedValue([closed]);
    vi.mocked(listWalletPositions).mockResolvedValue([closed]);
  });
  it("uses the same final result and Closed marker in detail, dashboard, wallet and history", async () => {
    const instance = await container();
    const detail = await instance.renderToString(PositionPage, {
      request: new Request(`http://localhost/dashboard/positions/${gain.id}`),
      params: { id: gain.id },
      locals,
    });
    expect(positionResultText(detail)).toBe("Final +20.00% · sold Sep 1, 2026");
    expect(text(detail)).toContain("Closed");
    expect(text(detail)).toContain("Sell price 60 Sell date Sep 1, 2026");
    expect(detail).not.toContain('name="current_price"');
    expect(detail).not.toContain('name="sell_price"');
    expect(detail).toContain(`/dashboard/positions/${gain.id}/delete`);
    const dashboard = await instance.renderToString(Dashboard, {
      request: new Request("http://localhost/dashboard"),
      locals,
    });
    const member = await instance.renderToString(WalletPage, {
      request: new Request(`http://localhost/dashboard/wallets/${wallets[0].id}`),
      params: { id: wallets[0].id },
      locals,
    });
    for (const html of [dashboard, member]) {
      const record = text(row(html, `/dashboard/positions/${gain.id}`));
      expect(record).toContain("Closed");
      expect(record).toContain("Final +20.00% · sold Sep 1, 2026");
      expect(record).not.toContain("Oct 10, 2026");
    }
    const history = text(
      renderToStaticMarkup(
        createElement(ConfrontationPanel, {
          state: { kind: "history", positions: [{ ...closed, category_id: "reason" }] },
        }),
      ),
    );
    expect(history).toContain("Closed");
    expect(history).toContain("Final +20.00% · sold Sep 1, 2026");
    expect(history).not.toContain("Oct 10, 2026");
    expect(text(member)).toContain("Realised results only");
  });
  it("renders a zero sale without a quote and preserves all eight sale decimals", async () => {
    const instance = await container();
    vi.mocked(getPosition).mockResolvedValue({ ...closed, sell_price: "0", current_price: null, price_date: null });
    const options = {
      request: new Request(`http://localhost/dashboard/positions/${gain.id}`),
      params: { id: gain.id },
      locals,
    };
    expect(positionResultText(await instance.renderToString(PositionPage, options))).toBe(
      "Final -100.00% · sold Sep 1, 2026",
    );
    vi.mocked(getPosition).mockResolvedValue({ ...closed, sell_price: "123456789012.12345678" });
    expect(text(await instance.renderToString(PositionPage, options))).toContain("Sell price 123,456,789,012.12345678");
  });
  it("labels mixed and realised-only summaries consistently", async () => {
    vi.mocked(listPositions).mockResolvedValue([
      closed,
      { ...loss, buy_price: "10", current_price: "12", quantity: "20" },
    ]);
    vi.mocked(listWalletPositions).mockResolvedValue([
      closed,
      { ...loss, buy_price: "10", current_price: "12", quantity: "20" },
    ]);
    const instance = await container();
    const list = await instance.renderToString(WalletList, {
      request: new Request("http://localhost/dashboard/wallets"),
      locals,
    });
    expect(text(row(list, `/dashboard/wallets/${wallets[0].id}`))).toContain(
      "1,140.00 +140.00 (+14.00%) Open prices as of Oct 1, 2026 · Includes realised gains/losses",
    );
    vi.mocked(listWalletPositions).mockResolvedValue([closed]);
    expect(
      text(
        row(
          await instance.renderToString(WalletList, {
            request: new Request("http://localhost/dashboard/wallets"),
            locals,
          }),
          `/dashboard/wallets/${wallets[0].id}`,
        ),
      ),
    ).toContain("Realised results only");
  });
});

describe("native closing submissions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  async function submit(fields: Record<string, string>) {
    return (await container()).renderToResponse(PositionPage, {
      request: new Request(`http://localhost/dashboard/positions/${gain.id}`, {
        method: "POST",
        body: new URLSearchParams(fields),
      }),
      params: { id: gain.id },
      locals,
    });
  }
  const sale = { action: "close", sell_price: "0", sell_date: "2026-09-01", acknowledgement: "on" };
  it("starts with an empty sale price, UTC date and unchecked acknowledgement in a separate native form", async () => {
    const html = await (
      await container()
    ).renderToString(PositionPage, {
      request: new Request(`http://localhost/dashboard/positions/${gain.id}`),
      params: { id: gain.id },
      locals,
    });
    expect(html).toMatch(/<form[^>]*method="POST"[^>]*>[\s\S]*?name="action" value="close"/);
    const saleInput = /<input[^>]*name="sell_price"[^>]*>/.exec(html)?.[0];
    expect(saleInput).toBeDefined();
    expect(saleInput).toMatch(/\bvalue(?:="")?(?=\s|>)/);
    expect(html).toMatch(/name="sell_date"[^>]*value="2026-10-28"/);
    const checkbox = /<input[^>]*name="acknowledgement"[^>]*>/.exec(html)?.[0];
    expect(checkbox).toBeDefined();
    expect(checkbox).not.toContain("checked");
    expect(text(html)).toContain(
      "I am closing the entire position. Sale corrections and reopening are not available yet.",
    );
  });
  it("closes with zero, strips acknowledgement and redirects to a GET", async () => {
    vi.mocked(closePosition).mockResolvedValue({ ok: true });
    const response = await submit(sale);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/dashboard/positions/${gain.id}`);
    expect(closePosition).toHaveBeenCalledExactlyOnceWith({}, gain.id, { sell_price: "0", sell_date: "2026-09-01" });
    expect(updatePositionPrice).not.toHaveBeenCalled();
  });
  it("keeps invalid sale values and shows acknowledgement and field errors without writing", async () => {
    const html = await (await submit({ action: "close", sell_price: "-1", sell_date: "2026-02-30" })).text();
    expect(html).toMatch(/name="sell_price"[^>]*value="-1"/);
    expect(html).toMatch(/name="sell_date"[^>]*value="2026-02-30"/);
    expect(html).toContain('id="sell_price-error"');
    expect(html).toContain('id="sell_date-error"');
    expect(html).toContain('id="acknowledgement-error"');
    expect(closePosition).not.toHaveBeenCalled();
    expect(updatePositionPrice).not.toHaveBeenCalled();
  });
  it.each(["validation", "unexpected"] as const)(
    "retains submitted sale values after %s write failure",
    async (error) => {
      vi.mocked(closePosition).mockResolvedValue({ ok: false, error });
      const html = await (await submit({ ...sale, sell_price: "60,12345678" })).text();
      expect(html).toMatch(/name="sell_price"[^>]*value="60,12345678"/);
      expect(html).toMatch(/name="sell_date"[^>]*value="2026-09-01"/);
      expect(/<input[^>]*name="acknowledgement"[^>]*>/.exec(html)?.[0]).toContain("checked");
      expect(text(html)).toContain("sale could not be saved");
      expect(text(html)).not.toContain("price could not be saved");
    },
  );
  it("returns the generic unavailable page when a conditional close finds no row", async () => {
    vi.mocked(closePosition).mockResolvedValue({ ok: false, error: "not_found" });
    const response = await submit(sale);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Position not found");
  });
  it.each([undefined, "price"])("supports price submissions with action %s", async (action) => {
    vi.mocked(updatePositionPrice).mockResolvedValue({ ok: true });
    const fields: Record<string, string> = { current_price: "70", price_date: "2026-10-01" };
    if (action !== undefined) fields.action = action;
    expect((await submit(fields)).status).toBe(303);
    expect(updatePositionPrice).toHaveBeenCalledExactlyOnceWith({}, gain.id, {
      current_price: "70",
      price_date: "2026-10-01",
    });
    expect(closePosition).not.toHaveBeenCalled();
  });
  it.each(["", "unknown"])("rejects action %s without any write", async (action) => {
    const html = await (await submit({ ...sale, action })).text();
    expect(text(html)).toContain("submission was not recognised");
    expect(closePosition).not.toHaveBeenCalled();
    expect(updatePositionPrice).not.toHaveBeenCalled();
  });
  it("rejects a file action without writing", async () => {
    const body = new FormData();
    body.set("action", new Blob(["close"]), "action.txt");
    const response = await (
      await container()
    ).renderToResponse(PositionPage, {
      request: new Request(`http://localhost/dashboard/positions/${gain.id}`, { method: "POST", body }),
      params: { id: gain.id },
      locals,
    });
    expect(text(await response.text())).toContain("submission was not recognised");
    expect(closePosition).not.toHaveBeenCalled();
    expect(updatePositionPrice).not.toHaveBeenCalled();
  });
  it("names the attempted sale when the load fails", async () => {
    vi.mocked(getPosition).mockRejectedValue(new Error("load failed"));
    const html = text(await (await submit(sale)).text());
    expect(html).toContain("Your sale was not saved");
    expect(html).not.toContain("Your price was not saved");
    expect(closePosition).not.toHaveBeenCalled();
  });
  it("rejects stale close and price submissions on an already closed detail", async () => {
    vi.mocked(getPosition).mockResolvedValue({ ...gain, sell_price: "60", sell_date: "2026-09-01" });
    for (const fields of [sale, { action: "price", current_price: "70", price_date: "2026-10-01" }]) {
      const html = await (await submit(fields)).text();
      expect(text(html)).toContain("already closed");
      expect(html).not.toContain('name="sell_price"');
      expect(html).not.toContain('name="current_price"');
    }
    expect(closePosition).not.toHaveBeenCalled();
    expect(updatePositionPrice).not.toHaveBeenCalled();
  });
});
