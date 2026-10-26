import { test, expect } from "@playwright/test";

// risk: session-survives-reload — user-selected standalone risk, 2026-10-23.
// facet: saved session reaches /dashboard and survives a real SSR reload.
// seed: tests/e2e/seed.spec.ts (covers the anonymous redirect separately).
test.describe("session-survives-reload", () => {
  test("saved session keeps the same user on the dashboard after reload", async ({ page }) => {
    const username = process.env.E2E_USERNAME;
    if (!username) throw new Error("Set E2E_USERNAME in .env");

    // Open the protected dashboard using the setup project's saved session.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Your positions", exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${username}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();

    // A full SSR reload must keep the protected page and the same identity.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Your positions", exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${username}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();

    // No application data is written. Playwright disposes this isolated context;
    // signing out would revoke the session used by other parallel tests.
  });
});
