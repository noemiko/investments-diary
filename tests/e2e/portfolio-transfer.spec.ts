import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import type { ApiDatabase } from "../../src/db/api.types";
import { examplePortfolio } from "../../src/lib/portfolio-transfer/fixtures";
import { waitForHydration } from "./helpers/hydration";

test("original XLSX previews, replaces and undoes a portfolio without downloading prices", async ({ page }, info) => {
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  const url = new URL(status.API_URL);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    new URL(process.env.SUPABASE_URL ?? "http://invalid").origin !== url.origin
  )
    throw new Error("Portfolio transfer fixtures require the same local Supabase as the app");
  if (
    !process.env.PORTFOLIO_RECOVERY_KEYS ||
    !process.env.PORTFOLIO_DEPLOYMENT_ID ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error("Configure local transfer signing and service credentials in the test server environment");
  const admin = createClient<ApiDatabase>(url.origin, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `portfolio-${randomUUID()}@example.test`,
    password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const owner = created.data.user.id;
  const origin = String(info.project.use.baseURL);
  try {
    const preview = await admin.rpc("portfolio_recovery_preview", { in_user_id: owner });
    if (preview.error) throw preview.error;
    const fingerprint = (preview.data as { fingerprint: string }).fingerprint;
    const seeded = await admin.rpc("portfolio_replace", {
      in_user_id: owner,
      in_data: examplePortfolio().data,
      in_fingerprint: fingerprint,
      in_operation_id: randomUUID(),
    });
    if (seeded.error) throw seeded.error;
    const login = await page.request.post("/api/auth/signin", {
      headers: { Origin: origin },
      form: { email, password },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(302);
    const rejectedPagePost = await page.request.post("/dashboard/portfolio", { headers: { Origin: origin } });
    expect(rejectedPagePost.status()).toBe(405);
    expect(rejectedPagePost.headers().allow).toBe("GET");
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Export & recovery", exact: true }).click();
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "Export and recover portfolio", exact: true })).toBeVisible();
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel", exact: true }).click();
    const download = await pendingDownload;
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Workbook download did not produce a local file");
    const workbook = await readFile(downloadPath);
    expect(workbook.length).toBeGreaterThan(1000);
    expect(download.suggestedFilename()).toMatch(/^portfolio-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const added = await admin
      .from("wallets")
      .insert({ user_id: owner, name: "Added after export", currency: "PLN", starting_value: "1234.56789012" });
    if (added.error) throw added.error;
    const upload = page.getByLabel("Original portfolio XLSX", { exact: true });
    await upload.setInputFiles({
      name: "broken.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("not a workbook"),
    });
    await page.getByRole("button", { name: "Preview recovery", exact: true }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByRole("alert")).toContainText("not a supported recovery file");
    await upload.setInputFiles({
      name: "original.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbook,
    });
    await page.getByRole("button", { name: "Preview recovery", exact: true }).click();
    const heading = page.getByRole("heading", { name: "Review portfolio recovery", exact: true });
    await expect(heading).toBeFocused();
    const incoming = page.getByRole("heading", { name: "Portfolio to restore", exact: true }).locator("..");
    const current = page.getByRole("heading", { name: "Current portfolio to replace", exact: true }).locator("..");
    await expect(incoming.locator("dd").nth(0)).toHaveText("2");
    await expect(incoming.locator("dd").nth(1)).toHaveText("1");
    await expect(incoming.locator("dd").nth(2)).toHaveText("1");
    await expect(current.locator("dd").nth(0)).toHaveText("3");
    await page.screenshot({
      path: info.outputPath("portfolio-preview-desktop.png"),
      fullPage: true,
      style: "astro-dev-toolbar { visibility: hidden !important; }",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: info.outputPath("portfolio-preview-mobile.png"),
      fullPage: true,
      style: "astro-dev-toolbar { visibility: hidden !important; }",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const replace = page.getByRole("button", { name: "Replace portfolio", exact: true });
    await expect(replace).toBeDisabled();
    const confirmation = page.getByLabel("Type REPLACE PORTFOLIO to confirm", { exact: true });
    await confirmation.fill("replace portfolio");
    await expect(replace).toBeDisabled();
    await confirmation.fill("REPLACE PORTFOLIO");
    await confirmation.press("Enter");
    await expect(page).toHaveURL(`${origin}/dashboard`);
    const recoveredWallets = await admin.from("wallets").select("name").eq("user_id", owner).order("name");
    expect(recoveredWallets.error).toBeNull();
    expect(recoveredWallets.data?.map((row) => row.name)).toEqual(["Empty EUR", "Long-term USD"]);
    await expect(page.getByText("Added after export", { exact: true })).toHaveCount(0);
    await page.goto("/dashboard/portfolio");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Preview undo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review undo", exact: true })).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Portfolio to restore", exact: true }).locator("..").locator("dd").nth(0),
    ).toHaveText("3");
    await page.getByLabel("Type REPLACE PORTFOLIO to confirm", { exact: true }).fill("REPLACE PORTFOLIO");
    await page.getByRole("button", { name: "Undo latest recovery", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/dashboard`);
    const undoneWallets = await admin.from("wallets").select("name").eq("user_id", owner).order("name");
    expect(undoneWallets.error).toBeNull();
    expect(undoneWallets.data?.map((row) => row.name)).toEqual(["Added after export", "Empty EUR", "Long-term USD"]);
  } finally {
    expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});
