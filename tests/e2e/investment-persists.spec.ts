import { test, expect } from "@playwright/test";
import { investmentData } from "./helpers/investment-data";
import { waitForHydration } from "./helpers/hydration";

// risk: investment-persists — user-selected standalone flow, 2026-10-23.
// seed: tests/e2e/seed.spec.ts; real auth, routing, form submission, DB and SSR.
test.describe("investment-persists", () => {
  test("investment saved through the form remains on the list after reload", async ({ page }) => {
    const data = await investmentData();
    test.info().annotations.push({ type: "test-data", description: data.token });
    try {
      // Open the form with an isolated wallet/category and the saved user session.
      await page.goto("/dashboard/new");
      await waitForHydration(page);
      await page.getByRole("textbox", { name: "Instrument", exact: true }).fill(data.token);
      await page.getByRole("textbox", { name: "Buy price (per share)", exact: true }).fill("50.25");
      await page.getByLabel("Buy date", { exact: true }).fill("2026-01-15");
      await page.getByRole("combobox", { name: "Wallet", exact: true }).selectOption({ label: data.token });
      await page.getByRole("combobox", { name: "Reason category", exact: true }).selectOption({ label: data.token });
      await page.getByRole("textbox", { name: "Quantity (optional)", exact: true }).fill("2");

      // Submit exactly once: repeating this action could create duplicate positions.
      await page.getByRole("button", { name: "Save investment", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      const row = page.getByRole("row").filter({ hasText: data.token });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("cell", { name: "50.25", exact: true })).toBeVisible();
      await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();

      // A fresh SSR read must still show this investment with the submitted values.
      await page.reload();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("cell", { name: "50.25", exact: true })).toBeVisible();
      await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
      await expect(row.getByRole("cell", { name: "Jan 15, 2026", exact: true })).toBeVisible();
    } finally {
      // Also runs on assertion failure; deletes only this token and verifies all three tables.
      await data.cleanup();
    }
  });
});
