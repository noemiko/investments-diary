import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { APIContext } from "astro";
import reactRenderer from "@astrojs/react/server.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewPosition from "@/pages/dashboard/new.astro";
import { POST as searchEndpoint, ALL as searchOther } from "@/pages/dashboard/new/search";
import { createPosition, listCategories, listConfrontationPositions } from "@/lib/services/positions";
import { listWallets } from "@/lib/services/wallets";
import { readMarketSelection, searchMarketSelections } from "@/lib/services/market-selections";
import { createClient } from "@/lib/supabase";
import { reportUnexpected } from "@/lib/observability/reporter";
import { createYahooMarketData } from "@/lib/market-data/yahoo";
import type { MarketSelectionChoice } from "@/types";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/observability/reporter", () => ({ reportUnexpected: vi.fn() }));
vi.mock("@/lib/services/positions", () => ({
  createPosition: vi.fn(),
  listCategories: vi.fn(),
  listConfrontationPositions: vi.fn(),
}));
vi.mock("@/lib/services/wallets", () => ({ listWallets: vi.fn() }));
vi.mock("@/lib/services/market-selections", () => ({ readMarketSelection: vi.fn(), searchMarketSelections: vi.fn() }));
vi.mock("@/lib/market-data/yahoo", () => ({ createYahooMarketData: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000001";
const receiptId = "10000000-0000-4000-8000-000000000002";
const choice: MarketSelectionChoice = {
  receiptId,
  targetId: id,
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NMS",
  exchangeName: "Nasdaq",
  instrumentType: "EQUITY",
  validUntil: "2099-01-01T00:00:00Z",
};
const locals: App.Locals = {
  user: {
    id,
    email: "author@example.test",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  },
};
const fields = {
  wallet_id: id,
  listing_query: "Apple",
  listing_receipt_id: receiptId,
  instrument: "UNTRUSTED LABEL",
  opening_commission: "0",
  buy_price: "50,12345678",
  buy_date: "2026-01-01",
  category_id: id,
  reason_text: "Preserve my reasoning",
  quantity: "2.25",
  broker_label: "My broker",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listCategories).mockResolvedValue([{ id, name: "Growth" }]);
  vi.mocked(listWallets).mockResolvedValue([{ id, name: "Main", currency: "USD", starting_value: "0" }]);
  vi.mocked(listConfrontationPositions).mockResolvedValue([]);
  vi.mocked(readMarketSelection).mockResolvedValue(choice);
  vi.mocked(searchMarketSelections).mockResolvedValue({ ok: true, choices: [choice] });
  vi.mocked(createPosition).mockResolvedValue({ ok: true, id });
});
async function render(
  body?: Record<string, string>,
  headers: Record<string, string> = { origin: "http://localhost" },
  authenticated = true,
) {
  const container = await AstroContainer.create();
  container.addServerRenderer({ renderer: reactRenderer });
  return container.renderToResponse(NewPosition, {
    request: new Request(
      "http://localhost/dashboard/new",
      body ? { method: "POST", headers, body: new URLSearchParams(body) } : undefined,
    ),
    locals: authenticated ? locals : { user: null },
  });
}
function plain(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

it("opening the form never searches, reads a selection or downloads a quote", async () => {
  const html = await (await render()).text();
  expect(html).toContain("Search listings");
  expect(html).not.toContain('id="instrument"');
  expect(searchMarketSelections).not.toHaveBeenCalled();
  expect(readMarketSelection).not.toHaveBeenCalled();
  expect(createYahooMarketData).not.toHaveBeenCalled();
  expect(createPosition).not.toHaveBeenCalled();
});
it("native search bypasses buy validation and retains every other raw field", async () => {
  const html = await (
    await render({
      ...fields,
      action: "search_listing",
      opening_commission: "0",
      buy_price: "unfinished",
      new_category_name: "Draft category",
    })
  ).text();
  expect(searchMarketSelections).toHaveBeenCalledExactlyOnceWith({}, id, id, "Apple", expect.anything());
  expect(html).toContain('name="select_listing"');
  expect(html).toContain(`value="${receiptId}"`);
  expect(html).toMatch(/formnovalidate/i);
  expect(html).toContain('value="unfinished"');
  expect(html).toContain("Preserve my reasoning");
  expect(html).toContain('value="Draft category"');
  expect(html).toContain('value="2.25"');
  expect(html).toContain('value="My broker"');
  expect(html).not.toContain("Enter a number like");
  expect(readMarketSelection).not.toHaveBeenCalled();
  expect(createPosition).not.toHaveBeenCalled();
  expect(createYahooMarketData).not.toHaveBeenCalled();
});
it("native selection reads the server receipt without searching, quoting or validating unfinished buy fields", async () => {
  const html = await (
    await render({ ...fields, select_listing: receiptId, opening_commission: "0", buy_price: "unfinished" })
  ).text();
  expect(readMarketSelection).toHaveBeenCalledExactlyOnceWith({}, id, id, receiptId);
  expect(plain(html)).toContain("Selected: Apple Inc. · AAPL");
  expect(html).toContain('name="instrument" value="AAPL"');
  expect(html).not.toContain("UNTRUSTED LABEL");
  expect(html).toContain('value="unfinished"');
  expect(html).toContain("Preserve my reasoning");
  expect(html).not.toContain("Enter a number like");
  expect(searchMarketSelections).not.toHaveBeenCalled();
  expect(createPosition).not.toHaveBeenCalled();
  expect(createYahooMarketData).not.toHaveBeenCalled();
});
it("saving uses the owner-bound canonical symbol and receipt while leaving quote download explicit", async () => {
  const response = await render({ ...fields, action: "save" });
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/dashboard");
  expect(createPosition).toHaveBeenCalledExactlyOnceWith(
    {},
    id,
    expect.objectContaining({
      instrument: "AAPL",
      listing_receipt_id: receiptId,
      opening_commission: "0",
      buy_price: "50.12345678",
      quantity: "2.25",
      reason_text: fields.reason_text,
    }),
  );
  expect(searchMarketSelections).not.toHaveBeenCalled();
  expect(createYahooMarketData).not.toHaveBeenCalled();
});
it.each(["save", "select_listing"])(
  "unavailable or wallet-mismatched receipt is recoverable during %s",
  async (action) => {
    vi.mocked(readMarketSelection).mockResolvedValue(null);
    const body = action === "save" ? { ...fields, action } : { ...fields, select_listing: receiptId };
    const html = await (await render(body)).text();
    expect(html).toContain("Search and select the stock listing again");
    expect(html).toContain('value="50,12345678"');
    expect(html).toContain("Preserve my reasoning");
    expect(html).toContain('value="Apple"');
    expect(html).not.toContain("UNTRUSTED LABEL");
    expect(createPosition).not.toHaveBeenCalled();
    expect(createYahooMarketData).not.toHaveBeenCalled();
  },
);
it("preserves the draft and asks for reselection after the insert rejects a previously valid receipt", async () => {
  vi.mocked(createPosition).mockResolvedValue({ ok: false, error: "selection_invalid" });
  const html = await (await render({ ...fields, action: "save" })).text();
  expect(createPosition).toHaveBeenCalledOnce();
  expect(html).toContain("Search and select the stock listing again");
  expect(html).toContain('value="50,12345678"');
  expect(html).toContain("Preserve my reasoning");
  expect(html).toContain('value="Apple"');
  expect(html).not.toContain(receiptId);
});
const unverifiedHeaders: Record<string, string>[] = [
  {},
  { origin: "https://attacker.test" },
  { origin: "http://localhost", "sec-fetch-site": "cross-site" },
];
it.each(unverifiedHeaders)("rejects unverified native searches before provider work", async (headers) => {
  const response = await render({ ...fields, action: "search_listing" }, headers);
  expect(response.status).toBe(403);
  expect(searchMarketSelections).not.toHaveBeenCalled();
  expect(readMarketSelection).not.toHaveBeenCalled();
  expect(createPosition).not.toHaveBeenCalled();
});
it("requires authentication before search", async () => {
  const response = await render({ ...fields, action: "search_listing" }, undefined, false);
  expect(response.headers.get("location")).toBe("/auth/signin");
  expect(searchMarketSelections).not.toHaveBeenCalled();
});
it("provider search failure leaves the investment draft usable without saving or quoting", async () => {
  vi.mocked(searchMarketSelections).mockResolvedValue({ ok: false, reason: "timeout" });
  const html = await (await render({ ...fields, action: "search_listing" })).text();
  expect(html).toContain("Stock search is unavailable");
  expect(html).toContain("Preserve my reasoning");
  expect(html).toContain('value="50,12345678"');
  expect(createPosition).not.toHaveBeenCalled();
  expect(createYahooMarketData).not.toHaveBeenCalled();
});

it("never echoes a foreign submitted wallet or category after an invalid selection", async () => {
  const foreignWallet = "10000000-0000-4000-8000-000000000099";
  const foreignCategory = "10000000-0000-4000-8000-000000000098";
  vi.mocked(readMarketSelection).mockResolvedValue(null);
  const html = await (
    await render({ ...fields, action: "save", wallet_id: foreignWallet, category_id: foreignCategory })
  ).text();
  expect(html).not.toContain(foreignWallet);
  expect(html).not.toContain(foreignCategory);
  expect(html).toContain("Preserve my reasoning");
  expect(html).toContain('value="50,12345678"');
  expect(createPosition).not.toHaveBeenCalled();
});

describe("in-place search endpoint (/dashboard/new/search)", () => {
  async function search(
    body: unknown,
    options: {
      method?: string;
      authenticated?: boolean;
      origin?: string | null;
      site?: string;
      raw?: string;
      contentType?: string;
    } = {},
  ) {
    const method = options.method ?? "POST";
    const headers = new Headers({ "content-type": options.contentType ?? "application/json" });
    if (options.origin !== null) headers.set("origin", options.origin ?? "http://localhost");
    if (options.site) headers.set("sec-fetch-site", options.site);
    const request = new Request("http://localhost/dashboard/new/search", {
      method,
      headers,
      ...(["GET", "HEAD"].includes(method) ? {} : { body: options.raw ?? JSON.stringify(body) }),
    });
    const context = {
      request,
      locals: options.authenticated === false ? { user: null } : locals,
      cookies: {},
    } as unknown as APIContext;
    return await (method === "POST" ? searchEndpoint : searchOther)(context);
  }
  const valid = { walletId: id, query: "Apple" };
  function expectNoProviderWork() {
    expect(searchMarketSelections).not.toHaveBeenCalled();
    expect(createYahooMarketData).not.toHaveBeenCalled();
  }

  it("returns the service's receipts for an explicit, verified search", async () => {
    const response = await search(valid);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, choices: [choice] });
    expect(searchMarketSelections).toHaveBeenCalledExactlyOnceWith({}, id, id, "Apple", expect.any(AbortSignal));
    expect(createPosition).not.toHaveBeenCalled();
    expect(readMarketSelection).not.toHaveBeenCalled();
  });
  it("only accepts POST", async () => {
    for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
      const response = await search(valid, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    expectNoProviderWork();
  });
  it("requires authentication before building a client", async () => {
    const response = await search(valid, { authenticated: false });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, reason: "unauthenticated" });
    expect(createClient).not.toHaveBeenCalled();
    expectNoProviderWork();
  });
  it("rejects foreign, absent and cross-site origins", async () => {
    for (const origin of ["https://attacker.test", null]) expect((await search(valid, { origin })).status).toBe(403);
    expect((await search(valid, { site: "cross-site" })).status).toBe(403);
    expectNoProviderWork();
  });
  it("rejects malformed, oversized, non-JSON and out-of-range requests without provider work", async () => {
    const bad = [
      { walletId: "not-a-uuid", query: "Apple" },
      { walletId: id, query: "A" },
      { walletId: id, query: "  A  " },
      { walletId: id, query: "x".repeat(101) },
      { walletId: id },
      { query: "Apple" },
      { ...valid, currency: "USD" },
      [],
      null,
    ];
    for (const body of bad) expect((await search(body)).status).toBe(400);
    expect((await search(valid, { raw: "{" })).status).toBe(400);
    expect((await search(valid, { raw: JSON.stringify({ ...valid, pad: "x".repeat(4097) }) })).status).toBe(400);
    expect((await search(valid, { contentType: "text/plain" })).status).toBe(400);
    expect((await search(valid, { contentType: "application/x-www-form-urlencoded" })).status).toBe(400);
    expectNoProviderWork();
  });
  it.each([
    ["not_found", 404],
    ["invalid_request", 400],
    ["timeout", 503],
    ["provider_unavailable", 503],
  ] as const)("maps a %s service result to %i with only its reason", async (reason, status) => {
    vi.mocked(searchMarketSelections).mockResolvedValue({ ok: false, reason, status: 502, retryAfter: "x" });
    const response = await search(valid);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, reason });
  });
  it("reports unexpected failures once and returns a safe 503", async () => {
    vi.mocked(searchMarketSelections).mockRejectedValue(new Error("PRIVATE_DATABASE_DETAIL"));
    const response = await search(valid);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE_DATABASE_DETAIL");
    expect(reportUnexpected).toHaveBeenCalledOnce();
  });
});

it.each(["search_listing", "select_listing", "save"])(
  "preserves the opening commission during native %s round trips",
  async (action) => {
    vi.mocked(createPosition).mockResolvedValue({ ok: false, error: "unexpected" });
    const body = {
      ...fields,
      action,
      opening_commission: "5,00000001",
      ...(action === "select_listing" ? { select_listing: receiptId } : {}),
    };
    const html = await (await render(body)).text();
    expect(html).toMatch(/name="opening_commission"[^>]*value="5,00000001"/);
    expect(plain(html)).toContain("Opening commission (USD)");
    if (action === "save")
      expect(createPosition).toHaveBeenCalledWith(
        {},
        id,
        expect.objectContaining({ opening_commission: "5.00000001" }),
      );
  },
);
it("blocks a fee-bearing native creation without quantity and preserves the raw fee", async () => {
  const html = await (await render({ ...fields, action: "save", opening_commission: "5", quantity: "" })).text();
  expect(plain(html)).toContain("Enter quantity to record a commission");
  expect(html).toMatch(/name="opening_commission"[^>]*value="5"/);
  expect(createPosition).not.toHaveBeenCalled();
});
