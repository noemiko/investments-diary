import { test as setup, expect } from "@playwright/test";
import { waitForHydration } from "./helpers/hydration";

setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password)
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD in .env (see context/foundation/test-stack.md)");

  await page.goto("/auth/signin");
  await waitForHydration(page);
  await page.getByLabel("Email", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith("/api/auth/signin") && response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe("/dashboard");
  await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "Your positions", exact: true })).toBeVisible();
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
