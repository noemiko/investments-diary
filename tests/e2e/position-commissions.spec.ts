import { test, expect } from "@playwright/test";
import { investmentData } from "./helpers/investment-data";
import { waitForHydration } from "./helpers/hydration";

for (const javaScriptEnabled of [true, false]) {
  test.describe(`commissions (${javaScriptEnabled ? "hydrated" : "no JavaScript"})`, () => {
    test.use({ javaScriptEnabled, storageState: { cookies: [], origins: [] } });
    for (const missingQuantity of [false, true]) {
      test(`records ${missingQuantity ? "a legacy quantity on close" : "separate commissions and net returns"}`, async ({
        page,
      }, info) => {
        const data = await investmentData();
        try {
          const login = await page.request.post("/api/auth/signin", {
            headers: { Origin: String(info.project.use.baseURL) },
            form: { email: data.email, password: data.password },
            maxRedirects: 0,
          });
          expect(login.status()).toBe(302);
          // Seed search metadata only. Authentication, native select/save, validation and writes are real.
          const selected = await page.request.post("/dashboard/new", {
            headers: { Origin: String(info.project.use.baseURL) },
            form: {
              select_listing: data.receiptId,
              wallet_id: data.walletId,
              listing_query: data.symbol,
              buy_price: "100",
              buy_date: "2026-01-15",
              category_id: data.categoryId,
              quantity: missingQuantity ? "" : "10",
              opening_commission: missingQuantity ? "" : "5",
            },
          });
          expect(selected.status()).toBe(200);
          const html = await selected.text();
          await page.route(
            "**/dashboard/new",
            (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }),
            { times: 1 },
          );
          await page.goto("/dashboard/new");
          if (javaScriptEnabled) await waitForHydration(page);
          await expect(page.getByLabel("Opening commission (USD)", { exact: true })).toHaveValue(
            missingQuantity ? "" : "5",
          );
          if (!missingQuantity) {
            await page.getByLabel("Opening commission (USD)", { exact: true }).fill("-1");
            await page.getByRole("button", { name: "Save investment", exact: true }).click();
            await expect(page.getByText("Enter a number like 50.25", { exact: true })).toBeVisible();
            await expect(page.getByLabel("Opening commission (USD)", { exact: true })).toHaveValue("-1");
            await page.getByLabel("Opening commission (USD)", { exact: true }).fill("5");
          }
          await page.getByRole("button", { name: "Save investment", exact: true }).click();
          await expect(page).toHaveURL(/\/dashboard$/);
          const row = page.getByRole("row").filter({ hasText: data.symbol });
          await expect(row).toContainText("No price yet");
          const wallet = page.locator(`[data-wallet-summary="${data.walletId}"]`);
          await expect(wallet).toContainText(missingQuantity ? "1,000.00" : "995.00");
          if (!missingQuantity) await expect(wallet).toContainText("valuations incomplete");
          await row.getByRole("link", { name: data.symbol, exact: true }).click();
          await expect(
            page.getByText(`Opening commission: ${missingQuantity ? "0" : "5"} USD`, { exact: false }),
          ).toBeVisible();
          await page.getByLabel("Sell price (per share)", { exact: true }).fill("110");
          await page.getByLabel("Sell date", { exact: true }).fill("2026-09-01");
          await page.getByLabel("Closing commission (USD)", { exact: true }).fill("7");
          await page.getByLabel("I am closing the entire position.", { exact: false }).check();
          if (missingQuantity) {
            await page.getByRole("button", { name: "Close position", exact: true }).click();
            await expect(page.getByText("Enter quantity to record a commission", { exact: true })).toBeVisible();
            await expect(page.getByLabel("Closing commission (USD)", { exact: true })).toHaveValue("7");
            await page.getByLabel("Quantity (required for a nonzero commission)", { exact: true }).fill("10");
          } else {
            await expect(page.locator('input[name="quantity"]')).toHaveCount(0);
          }
          await page.getByRole("button", { name: "Close position", exact: true }).click();
          await expect(
            page.getByText(missingQuantity ? "Final +9.30%" : "Final +8.76%", { exact: true }),
          ).toBeVisible();
          await expect(page.getByText("Closing commission: 7 USD", { exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: "Close position", exact: true })).toHaveCount(0);
          await page.screenshot({
            path: info.outputPath("commission-detail.png"),
            fullPage: true,
            style: "astro-dev-toolbar { display: none !important; }",
          });
          await page.goto("/dashboard");
          await expect(page.locator(`[data-wallet-summary="${data.walletId}"]`)).toContainText(
            missingQuantity ? "1,093.00" : "1,088.00",
          );
          await expect(page.getByRole("row").filter({ hasText: data.symbol })).toContainText(
            missingQuantity ? "Final +9.30%" : "Final +8.76%",
          );
        } finally {
          await data.cleanup();
        }
      });
    }
  });
}
