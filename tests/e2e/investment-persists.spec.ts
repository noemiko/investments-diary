import { test, expect } from "@playwright/test";
import { investmentData } from "./helpers/investment-data";
import { waitForHydration } from "./helpers/hydration";

// Metadata search is a seeded, owner/wallet-bound receipt fixture. Native selection,
// save, authentication, routing, exact decimal writes, database reads and SSR are real.
for (const javaScriptEnabled of [true, false]) {
  test.describe(`investment-persists (${javaScriptEnabled ? "hydrated" : "no JavaScript"})`, () => {
    test.use({ javaScriptEnabled });
    test("selected investment persists without downloading a quote", async ({ page }, info) => {
      const data = await investmentData();
      info.annotations.push({ type: "test-data", description: data.token });
      const downloads: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && /market-prices\/.*download/.test(request.url()))
          downloads.push(request.url());
      });
      try {
        // Render the real native Select response with a persisted metadata fixture;
        // browser tests do not depend on Yahoo search availability or manufacture quotes.
        const selected = await page.request.post("/dashboard/new", {
          headers: { Origin: String(info.project.use.baseURL) },
          form: {
            select_listing: data.receiptId,
            wallet_id: data.walletId,
            listing_query: data.symbol,
            buy_price: "unfinished",
            buy_date: "2026-01-15",
            category_id: data.categoryId,
            reason_text: "Keep this investment reasoning",
            quantity: "2",
            broker_label: "Fixture broker",
          },
        });
        expect(selected.status()).toBe(200);
        const html = await selected.text();
        await page.route(
          "**/dashboard/new",
          async (route) => {
            await route.fulfill({ status: 200, contentType: "text/html", body: html });
          },
          { times: 1 },
        );
        await page.goto("/dashboard/new");
        if (javaScriptEnabled) await waitForHydration(page);
        await expect(page.getByRole("status")).toContainText(`Selected: ${data.token} · ${data.symbol}`);
        await expect(page.getByRole("textbox", { name: "Buy price (per share)", exact: true })).toHaveValue(
          "unfinished",
        );
        await expect(page.getByRole("textbox", { name: "Reason", exact: false })).toHaveValue(
          "Keep this investment reasoning",
        );
        await expect(page.getByRole("textbox", { name: "Broker (optional)", exact: true })).toHaveValue(
          "Fixture broker",
        );
        await page.getByRole("textbox", { name: "Buy price (per share)", exact: true }).fill("50.25");
        await page.screenshot({
          path: info.outputPath("selected-stock-form.png"),
          fullPage: true,
          style: "astro-dev-toolbar { display: none !important; }",
        });
        await page.getByRole("button", { name: "Save investment", exact: true }).click();
        await expect(page).toHaveURL(/\/dashboard$/);
        const row = page.getByRole("row").filter({ hasText: data.symbol });
        await expect(row).toHaveCount(1);
        await expect(row.getByRole("cell", { name: "50.25", exact: true })).toBeVisible();
        await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
        await expect(row).toContainText("Trading currency is not checked yet");
        await expect(row.getByRole("link", { name: /Link stock listing/ })).toHaveCount(0);
        // A new holding has no sale: it is listed under Open positions only.
        await expect(page.getByRole("heading", { name: "Open positions", exact: true })).toBeVisible();
        await expect(
          page.locator('[data-positions-section="open"]').getByRole("row").filter({ hasText: data.symbol }),
        ).toHaveCount(1);
        await expect(
          page.locator('[data-positions-section="closed"]').getByRole("row").filter({ hasText: data.symbol }),
        ).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Download prices", exact: true })).toBeEnabled();
        await page.reload();
        await expect(row).toHaveCount(1);
        await expect(row.getByRole("cell", { name: "Jan 15, 2026", exact: true })).toBeVisible();
        await page.screenshot({
          path: info.outputPath("saved-stock-selection.png"),
          fullPage: true,
          style: "astro-dev-toolbar { display: none !important; }",
        });
        // Below md the same holding is a card (the table is display:none), with its result and one-line notice.
        await page.setViewportSize({ width: 390, height: 844 });
        const card = page.locator("[data-position-card]").filter({ hasText: data.symbol });
        await expect(card).toBeVisible();
        await expect(row).toBeHidden();
        await expect(card).toContainText("No price yet");
        await expect(card).toContainText("Trading currency is not checked yet");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(await data.selectedPosition()).toMatchObject({
          instrument: data.symbol,
          market_target_id: data.targetId,
          market_listing_id: null,
          current_price: null,
        });
        expect(downloads).toEqual([]);
      } finally {
        await data.cleanup();
      }
    });
  });
}
