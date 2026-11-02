import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ApiDatabase } from "../../src/db/api.types";
import { waitForHydration } from "./helpers/hydration";

test.use({ storageState: { cookies: [], origins: [] } });
test("price controls fetch only on explicit actions and retain unsaved manual/sale values", async ({ page }, info) => {
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
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
  const email = `prices-${randomUUID()}@example.test`,
    password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const owner = created.data.user.id;
  try {
    const wallet = await admin
      .from("wallets")
      .insert({
        user_id: owner,
        name: "Price controls",
        starting_value: "1000",
        currency: "USD",
      })
      .select("id")
      .single();
    if (wallet.error) throw wallet.error;
    const category = await admin
      .from("reason_categories")
      .insert({ user_id: owner, name: "Price controls" })
      .select("id")
      .single();
    if (category.error) throw category.error;
    const target = await admin
      .from("wallets")
      .insert({ user_id: owner, name: "Target USD", starting_value: "0", currency: "USD" })
      .select("id")
      .single();
    if (target.error) throw target.error;
    const cache = await admin
      .from("market_quote_cache")
      .insert({
        user_id: owner,
        provider: "yahoo",
        symbol: "AAPL",
        exchange: "NMS",
        currency: "USD",
        timezone: "America/New_York",
        listing_name: "Apple",
        exchange_name: "Nasdaq",
        instrument_type: "EQUITY",
        price: "11",
        market_at: "2026-01-02T12:00:00Z",
        market_date: "2026-01-02",
        fetched_at: "2026-01-02T12:01:00Z",
        market_state: "CLOSED",
        refresh_outcome: "success",
      })
      .select("id")
      .single();
    if (cache.error) throw cache.error;
    // Every holding needs a stock selection, created through the owner/wallet-bound receipt path.
    const receiptFor = async (symbol: string) => {
      const selection = await admin
        .from("market_listing_targets")
        .insert({
          user_id: owner,
          provider: "yahoo",
          symbol,
          exchange: "NMS",
          listing_name: `${symbol} fixture`,
          exchange_name: "Nasdaq",
          instrument_type: "EQUITY",
        })
        .select("id")
        .single();
      if (selection.error) throw selection.error;
      const receipt = await admin
        .from("market_selection_receipts")
        .insert({ user_id: owner, wallet_id: wallet.data.id, target_id: selection.data.id })
        .select("id")
        .single();
      if (receipt.error) throw receipt.error;
      return receipt.data.id;
    };
    const position = await admin
      .from("positions")
      .insert({
        user_id: owner,
        wallet_id: wallet.data.id,
        category_id: category.data.id,
        instrument: "AAPL",
        market_selection_receipt_id: await receiptFor("AAPL"),
        buy_date: "2026-01-01",
        buy_price: "10",
        quantity: "2",
        current_price: "11",
        price_date: "2026-01-02",
        reason_text: "Original reasoning",
      })
      .select("id")
      .single();
    if (position.error) throw position.error;
    // A selected insert starts unlinked; link the verified cache as a download would.
    expect(
      (await admin.from("positions").update({ market_listing_id: cache.data.id }).eq("id", position.data.id)).error,
    ).toBeNull();
    const pending = await admin
      .from("positions")
      .insert({
        user_id: owner,
        wallet_id: wallet.data.id,
        category_id: category.data.id,
        instrument: "MSFT",
        market_selection_receipt_id: await receiptFor("MSFT"),
        buy_date: "2026-01-01",
        buy_price: "10",
      })
      .select("id")
      .single();
    if (pending.error) throw pending.error;
    const baseURL = String(info.project.use.baseURL);
    expect(
      (
        await page.request.post("/api/auth/signin", {
          form: { email, password },
          headers: { Origin: baseURL },
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(302);
    // A holding's stock identity is its creation-time selection: existing-position listing
    // search, download and confirmation are rejected before any provider work.
    for (const [path, data] of [
      ["/dashboard/market-prices/listings/search", { positionId: pending.data.id, query: "Apple" }],
      ["/dashboard/market-prices/listings/download", { positionId: pending.data.id, symbol: "AAPL" }],
      [
        "/dashboard/market-prices/listings/confirm",
        { positionId: pending.data.id, lookupId: "00000000-0000-4000-8000-000000000001" },
      ],
    ] as const) {
      const rejected = await page.request.post(path, { data, headers: { Origin: baseURL } });
      expect(rejected.status()).toBe(409);
      expect(await rejected.json()).toEqual({ ok: false, reason: "selection_already_set" });
    }
    const actions: string[] = [];
    let releaseLookup: () => void = () => undefined;
    let lookupPending: Promise<void> | null = null;
    await page.route("**/dashboard/market-prices/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      actions.push(path);
      expect(route.request().method()).toBe("POST");
      if (lookupPending) await lookupPending;
      await route.fulfill({
        json: {
          ok: true,
          results: [
            { listingId: cache.data.id, symbol: "AAPL", outcome: "timeout", retryAfter: "2099-01-01T00:00:00Z" },
          ],
        },
      });
    });
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /Link stock listing/ })).toHaveCount(0);
    await expect(page.getByText(/Choose Link stock listing/)).toHaveCount(0);
    await page.goto(`/dashboard/positions/${pending.data.id}`);
    await expect(page.locator("#stock-listing")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Search listings", exact: true })).toHaveCount(0);
    await page.goto(`/dashboard/positions/${position.data.id}`);
    await page.reload();
    await waitForHydration(page);
    await expect(page.locator("#stock-listing")).toHaveCount(0);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(actions).toEqual([]);
    await page.getByLabel("Price (per share)", { exact: true }).fill("42.12345678");
    await page.getByLabel("Sell price (per share)", { exact: true }).fill("67.2");
    await expect(page.locator('[data-price-refresh="position-result"]')).toContainText("+10.00%");
    await page.getByLabel("Target wallet", { exact: true }).selectOption(target.data.id);
    await page.getByRole("button", { name: "Move position", exact: true }).click();
    await expect(
      page.getByText("Position moved. Its recorded facts and prior wallet observations are unchanged."),
    ).toBeVisible();
    await expect(page.locator('[data-price-refresh="position-wallet"]')).toContainText("Target USD");
    await expect(page.getByLabel("Price (per share)", { exact: true })).toHaveValue("42.12345678");
    await expect(page.getByLabel("Sell price (per share)", { exact: true })).toHaveValue("67.2");
    const moved = await admin.from("positions").select("wallet_id").eq("id", position.data.id).single();
    expect(moved.error).toBeNull();
    expect(moved.data?.wallet_id).toBe(target.data.id);
    await page.screenshot({
      path: info.outputPath("price-controls-retained-input.png"),
      fullPage: true,
      style: "astro-dev-toolbar { display: none !important; }",
    });

    actions.length = 0;
    await page.goto("/dashboard");
    await page.reload();
    await waitForHydration(page);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(actions).toEqual([]);
    lookupPending = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    const dashboardDownload = page.getByRole("button", { name: "Download prices", exact: true });
    await dashboardDownload.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("button", { name: "Downloading prices…", exact: true })).toBeDisabled();
    releaseLookup();
    lookupPending = null;
    await expect(page.getByText(/The provider did not respond in time/)).toBeVisible();
    await expect(dashboardDownload).toBeEnabled();
    await expect(
      page.getByText("Download finished. Values below use the saved prices selected by the diary.", { exact: true }),
    ).toBeVisible();
    expect(actions).toEqual(["/dashboard/market-prices/download"]);
    await expect(page.getByRole("row").filter({ hasText: "AAPL" })).toContainText("+10.00%");
    const retained = await admin.from("market_quote_cache").select("price::text").eq("id", cache.data.id).single();
    expect(retained.error).toBeNull();
    expect(retained.data?.price).toBe("11.00000000");
    await page.screenshot({
      path: info.outputPath("dashboard-explicit-download.png"),
      fullPage: true,
      style: "astro-dev-toolbar { display: none !important; }",
    });
  } finally {
    expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});
