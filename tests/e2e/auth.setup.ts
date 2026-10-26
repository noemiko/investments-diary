import { test as setup, expect } from "@playwright/test";

setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password)
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD in .env (see context/foundation/test-stack.md)");

  await page.goto("/auth/signin");
  await expect(async () => {
    await page.getByLabel("Email", { exact: true }).fill("");
    await page.getByLabel("Email", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill("");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 5_000 });
  }).toPass();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
