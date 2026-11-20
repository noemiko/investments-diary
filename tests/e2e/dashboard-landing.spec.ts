import { test, expect } from "@playwright/test";

// Risk: the app sends an authenticated user to the starter or wallets page
// instead of the dashboard. Auth setup exercises the real login form and redirect.
for (const entry of ["/", "/auth/signin"]) {
  test(`signed-in visitor opens dashboard from ${entry}`, async ({ page }) => {
    await page.goto(entry);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Your positions", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wallets", exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Your positions", exact: true })).toBeVisible();
  });
}

test.describe("anonymous entry", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const entry of ["/", "/dashboard/wallets"]) {
    test(`signed-out visitor reaches sign-in from ${entry}`, async ({ page }) => {
      await page.goto(entry);
      await expect(page).toHaveURL(entry === "/" ? "/auth/signin" : "/auth/signin?returnTo=%2Fdashboard%2Fwallets");
      await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    });
  }
});

test("signed-in visitor restores only safe dashboard destinations", async ({ page }) => {
  await page.goto("/auth/signin?returnTo=" + encodeURIComponent("/dashboard/wallets?range=30#discard"));
  await expect(page).toHaveURL("/dashboard/wallets?range=30");
  await page.goto("/auth/signin?returnTo=" + encodeURIComponent("//example.test/dashboard"));
  await expect(page).toHaveURL("/dashboard");
});
