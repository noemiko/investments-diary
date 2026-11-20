import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import type { ApiDatabase } from "../../src/db/api.types";
import { waitForHydration } from "./helpers/hydration";

test("past reasons and results follow the chosen category before saving", async ({ page }, info) => {
  // Fixture metadata stays local; this scenario never searches or downloads provider data.
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  const origin = new URL(status.API_URL);
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    new URL(process.env.SUPABASE_URL ?? "http://invalid").origin !== origin.origin
  )
    throw new Error("App and fixtures must use the same local Supabase");
  const admin = createClient<ApiDatabase>(origin.origin, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `decision-history-${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const owner = created.data.user.id;
  try {
    const wallet = await admin
      .from("wallets")
      .insert({ user_id: owner, name: "Decision history", currency: "USD", starting_value: "1000" })
      .select("id")
      .single();
    if (wallet.error) throw wallet.error;
    const categories = await admin
      .from("reason_categories")
      .insert(["Category A", "Category B", "Empty category"].map((name) => ({ user_id: owner, name })))
      .select("id,name");
    if (categories.error) throw categories.error;
    const categoryId = (name: string) => {
      const category = categories.data.find((category) => category.name === name);
      if (!category) throw new Error(`Missing fixture category ${name}`);
      return category.id;
    };
    const categoryA = categoryId("Category A");
    const categoryB = categoryId("Category B");
    const emptyCategory = categoryId("Empty category");
    const fixtures = [
      {
        symbol: "HISTORYOPEN",
        category_id: categoryA,
        reason_text: "Recurring revenue justified this purchase.",
        buy_price: "100",
        current_price: "120",
        price_date: "2026-01-20",
        sell_price: null,
        sell_date: null,
        deleted_at: null,
      },
      {
        symbol: "HISTORYCLOSED",
        category_id: categoryA,
        reason_text: "Lower debt justified this earlier purchase.",
        buy_price: "100",
        current_price: null,
        price_date: null,
        sell_price: "90",
        sell_date: "2026-02-03",
        deleted_at: null,
      },
      {
        symbol: "HISTORYOTHER",
        category_id: categoryB,
        reason_text: "Dividend income justified this purchase.",
        buy_price: "50",
        current_price: "55",
        price_date: "2026-01-21",
        sell_price: null,
        sell_date: null,
        deleted_at: null,
      },
      {
        symbol: "HISTORYDELETED",
        category_id: categoryA,
        reason_text: "This deleted decision must not appear.",
        buy_price: "100",
        current_price: "130",
        price_date: "2026-01-22",
        sell_price: null,
        sell_date: null,
        deleted_at: "2026-02-04T12:00:00Z",
      },
    ];
    const positions: { id: string; symbol: string; reason: string }[] = [];
    for (const { symbol, ...facts } of fixtures) {
      const target = await admin
        .from("market_listing_targets")
        .insert({
          user_id: owner,
          provider: "yahoo",
          symbol,
          listing_name: `${symbol} fixture`,
          exchange: "NMS",
          exchange_name: "Nasdaq",
          instrument_type: "EQUITY",
        })
        .select("id")
        .single();
      if (target.error) throw target.error;
      const receipt = await admin
        .from("market_selection_receipts")
        .insert({ user_id: owner, wallet_id: wallet.data.id, target_id: target.data.id })
        .select("id")
        .single();
      if (receipt.error) throw receipt.error;
      const position = await admin
        .from("positions")
        .insert({
          ...facts,
          user_id: owner,
          wallet_id: wallet.data.id,
          instrument: symbol,
          market_selection_receipt_id: receipt.data.id,
          buy_date: "2026-01-10",
          quantity: "2",
          opening_commission: "0",
          closing_commission: "0",
        })
        .select("id")
        .single();
      if (position.error) throw position.error;
      positions.push({ id: position.data.id, symbol, reason: facts.reason_text });
    }
    const savedPositions = async () => {
      const result = await admin.from("positions").select("*").eq("user_id", owner).order("id");
      if (result.error) throw result.error;
      return result.data;
    };
    const before = await savedPositions();
    expect(before).toHaveLength(4);
    const login = await page.request.post("/api/auth/signin", {
      headers: { Origin: String(info.project.use.baseURL) },
      form: { email, password },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(302);
    expect(login.headers().location).toBe("/dashboard");
    await page.goto("/dashboard/new");
    await waitForHydration(page);
    const panel = page.getByRole("region", { name: "Bought for the same reason before", exact: true });
    const entries = panel.locator("[data-confrontation-position-id]");
    const category = page.getByLabel("Reason category", { exact: true });
    await category.selectOption(categoryA);
    await expect(entries).toHaveCount(2);
    for (const position of positions.slice(0, 2)) {
      const entry = panel.locator(`[data-confrontation-position-id="${position.id}"]`);
      await expect(entry).toBeVisible();
      await expect(entry).toContainText(position.symbol);
      await expect(entry.getByText(position.reason, { exact: true })).toBeVisible();
    }
    const open = panel.locator(`[data-confrontation-position-id="${positions[0].id}"]`);
    await expect(open.getByText("+20.00%", { exact: true })).toBeVisible();
    await expect(open.getByText("as of Jan 20, 2026", { exact: true })).toBeVisible();
    const closed = panel.locator(`[data-confrontation-position-id="${positions[1].id}"]`);
    await expect(closed.getByText("Final -10.00%", { exact: true })).toBeVisible();
    await expect(closed.getByText("· sold Feb 3, 2026", { exact: true })).toBeVisible();
    await expect(panel.locator(`[data-confrontation-position-id="${positions[3].id}"]`)).toHaveCount(0);
    await expect(panel.getByText(positions[3].reason, { exact: true })).toHaveCount(0);

    await category.selectOption(categoryB);
    await expect(entries).toHaveCount(1);
    await expect(open).toHaveCount(0);
    await expect(closed).toHaveCount(0);
    await expect(panel.getByText(positions[0].reason, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(positions[1].reason, { exact: true })).toHaveCount(0);
    const other = panel.locator(`[data-confrontation-position-id="${positions[2].id}"]`);
    await expect(other).toBeVisible();
    await expect(other).toContainText(positions[2].symbol);
    await expect(other.getByText(positions[2].reason, { exact: true })).toBeVisible();
    await expect(other.getByText("+10.00%", { exact: true })).toBeVisible();
    await expect(other.getByText("as of Jan 21, 2026", { exact: true })).toBeVisible();

    await category.selectOption(emptyCategory);
    await expect(entries).toHaveCount(0);
    await expect(
      panel.getByText(
        "You have not recorded anything for this reason yet. This will be the first position bought for it.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    expect(await savedPositions()).toEqual(before);
  } finally {
    // Includes failed setup and soft-deleted rows through the account's cascading cleanup.
    expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});
