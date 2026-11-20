import { test, expect } from "@playwright/test";

// Risk: auth-gate-redirect — selected by the user during /10x-e2e-setup.
// An anonymous visitor must reach the login form instead of the protected dashboard.
test.use({ storageState: { cookies: [], origins: [] } });

test("auth-gate-redirect: signed-out dashboard visitor reaches the login form", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/auth/signin?returnTo=%2Fdashboard");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  // No data created; the isolated anonymous browser context is disposed by Playwright.
});
