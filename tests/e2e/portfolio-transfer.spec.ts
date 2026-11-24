import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import type { PortfolioData } from "../../src/lib/portfolio-transfer/schema";
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

function acceptancePortfolio(): PortfolioData {
  const data = examplePortfolio().data;
  const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const original = data.positions[0];
  const created = original.created_at;
  const eur = data.wallets[1];
  eur.name = "EUR analysis";
  eur.starting_value = "123.12345678";
  data.wallets.push({
    id: id(1),
    name: "PLN analysis",
    starting_value: "9876.54321098",
    currency: "PLN",
    created_at: created,
  });
  data.positions.push(
    {
      ...original,
      id: id(2),
      broker_label: "Later manual override",
      manual_price_saved_at: "2026-11-21T12:00:00Z",
      selected_price: original.current_price,
      selected_date: original.price_date,
      selected_at: "2026-11-21T12:00:00Z",
      selected_source: "manual_override",
    },
    {
      ...original,
      id: id(3),
      broker_label: "Missing price and quantity",
      quantity: null,
      opening_commission: "0",
      current_price: null,
      price_date: null,
      manual_price_saved_at: null,
      market_listing_id: null,
      listing_confirmed_at: null,
      selected_price: null,
      selected_date: null,
      selected_at: null,
      selected_source: "missing",
    },
    {
      ...original,
      id: id(4),
      wallet_id: eur.id,
      broker_label: "EUR manual",
      buy_price: "10.12345678",
      quantity: "3.12345678",
      opening_commission: "0.12345678",
      current_price: "12.12345678",
      price_date: "2026-11-19",
      manual_price_saved_at: null,
      market_listing_id: null,
      listing_confirmed_at: null,
      selected_price: "12.12345678",
      selected_date: "2026-11-19",
      selected_at: null,
      selected_source: "manual",
    },
    {
      ...original,
      id: id(5),
      wallet_id: id(1),
      broker_label: "PLN zero sale with fees",
      buy_price: "10.00000001",
      quantity: "2.12345678",
      opening_commission: "1.12345678",
      closing_commission: "2.12345678",
      sell_price: "0",
      sell_date: "2026-11-22",
      market_listing_id: null,
      listing_confirmed_at: null,
      selected_price: "0",
      selected_date: "2026-11-22",
      selected_at: "2026-11-22T00:00:00Z",
      selected_source: "sale",
    },
  );
  return data;
}

/** Compare recorded facts and relationship meaning while allowing fresh destination UUIDs. */
function comparablePortfolio(data: PortfolioData) {
  const ordered = <T>(rows: T[]) => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const wallets = new Map(data.wallets.map((row) => [row.id, row.name]));
  const categories = new Map(data.categories.map((row) => [row.id, row.name]));
  const stock = (row: Pick<PortfolioData["targets"][number], "provider" | "symbol" | "exchange" | "instrument_type">) =>
    [row.provider, row.symbol, row.exchange, row.instrument_type].join("|");
  const quoteKey = (row: PortfolioData["quotes"][number]) => [stock(row), row.currency, row.timezone].join("|");
  const targets = new Map(data.targets.map((row) => [row.id, stock(row)]));
  const quotes = new Map(data.quotes.map((row) => [row.id, quoteKey(row)]));
  return {
    wallets: ordered(data.wallets.map(({ id: _id, ...facts }) => facts)),
    categories: ordered(data.categories.map(({ id: _id, ...facts }) => facts)),
    quotes: ordered(data.quotes.map(({ id: _id, ...facts }) => facts)),
    targets: ordered(
      data.targets.map(({ id: _id, cache_id, ...facts }) => ({
        ...facts,
        cache: cache_id === null ? null : quotes.get(cache_id),
      })),
    ),
    positions: ordered(
      data.positions.map(({ id: _id, wallet_id, category_id, market_target_id, market_listing_id, ...facts }) => ({
        ...facts,
        wallet: wallets.get(wallet_id),
        category: categories.get(category_id),
        target: targets.get(market_target_id),
        listing: market_listing_id === null ? null : quotes.get(market_listing_id),
      })),
    ),
  };
}

test("three-currency recovery preserves recorded valuation and undo restores destination history", async ({
  page,
}, info) => {
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  ) as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
  const url = new URL(status.API_URL);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    new URL(process.env.SUPABASE_URL ?? "http://invalid").origin !== url.origin
  )
    throw new Error("Portfolio acceptance requires the same local Supabase as the app");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<ApiDatabase>(url.origin, status.SERVICE_ROLE_KEY, options);
  const author = createClient<ApiDatabase>(url.origin, status.ANON_KEY, options);
  const email = `portfolio-fidelity-${randomUUID()}@example.test`,
    password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const owner = created.data.user.id;
  const origin = String(info.project.use.baseURL);
  try {
    const preview = await admin.rpc("portfolio_recovery_preview", { in_user_id: owner });
    if (preview.error) throw preview.error;
    const seed = await admin.rpc("portfolio_replace", {
      in_user_id: owner,
      in_data: acceptancePortfolio(),
      in_fingerprint: (preview.data as { fingerprint: string }).fingerprint,
      in_operation_id: randomUUID(),
    });
    if (seed.error) throw seed.error;
    expect((await author.auth.signInWithPassword({ email, password })).error).toBeNull();
    const snapshot = async () => {
      const result = await author.rpc("portfolio_export_snapshot");
      if (result.error) throw result.error;
      return result.data as unknown as PortfolioData;
    };
    const extras = async () => {
      const [positions, observations, categories] = await Promise.all([
        admin
          .from("positions")
          .select(
            "instrument,buy_date,buy_price::text,quantity::text,opening_commission::text,closing_commission::text,broker_label,reason_text,created_at,deleted_at,current_price::text,price_date,manual_price_saved_at,sell_price::text,sell_date,listing_confirmed_at,wallets!positions_wallet_fkey(name),reason_categories(name)",
          )
          .eq("user_id", owner)
          .order("broker_label"),
        admin
          .from("wallet_snapshots")
          .select(
            "observation_day,captured_at,starting_value::text,value::text,realised_change::text,open_change::text,realised_count,open_count,not_counted,as_of,currency,automatic_count,manual_count,oldest_market_at,wallets(name)",
          )
          .eq("user_id", owner)
          .order("observation_day"),
        admin.from("reason_categories").select("name,created_at,deleted_at").eq("user_id", owner).order("name"),
      ]);
      for (const result of [positions, observations, categories]) if (result.error) throw result.error;
      return { positions: positions.data, observations: observations.data, categories: categories.data };
    };
    const beforeExport = await snapshot();
    expect(beforeExport.wallets.map((row) => row.currency).sort()).toEqual(["EUR", "PLN", "USD"]);
    expect(beforeExport.positions.map((row) => row.selected_source).sort()).toEqual([
      "automatic",
      "manual",
      "manual_override",
      "missing",
      "sale",
      "sale",
    ]);
    expect(beforeExport.positions.find((row) => row.broker_label === "EUR manual")?.quantity).toBe("3.12345678");
    expect(
      beforeExport.positions.find((row) => row.broker_label === "PLN zero sale with fees")?.closing_commission,
    ).toBe("2.12345678");
    const originalFacts = comparablePortfolio(beforeExport);
    expect(
      (
        await page.request.post("/api/auth/signin", {
          headers: { Origin: origin },
          form: { email, password },
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(302);
    await page.goto("/dashboard/portfolio");
    await waitForHydration(page);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel", exact: true }).click();
    const path = await (await downloading).path();
    if (!path) throw new Error("No original workbook downloaded");
    const original = await readFile(path);
    await info.attach("original-three-currency.xlsx", {
      body: original,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const missing = beforeExport.positions.find((row) => row.selected_source === "missing");
    const usd = beforeExport.wallets.find((row) => row.currency === "USD");
    if (!missing || !usd) throw new Error("Incomplete acceptance fixture");
    expect(
      (
        await admin
          .from("positions")
          .update({ deleted_at: "2026-11-23T12:00:00Z" })
          .eq("id", missing.id)
          .eq("user_id", owner)
      ).error,
    ).toBeNull();
    expect(
      (
        await admin
          .from("wallets")
          .insert({ user_id: owner, name: "Destination-only wallet", starting_value: "44.00000001", currency: "EUR" })
      ).error,
    ).toBeNull();
    expect(
      (await admin.from("reason_categories").insert({ user_id: owner, name: "Unused destination category" })).error,
    ).toBeNull();
    expect(
      (
        await admin.from("wallet_snapshots").insert({
          user_id: owner,
          wallet_id: usd.id,
          observation_day: "2026-01-01",
          captured_at: "2026-01-01T00:00:00Z",
          starting_value: "0",
          value: "-1000000000000000000000000.0000000000000001",
          realised_change: "-1000000000000000000000000.0000000000000001",
          open_change: "0",
          realised_count: 1,
          open_count: 0,
          not_counted: 0,
          as_of: null,
          currency: "USD",
        })
      ).error,
    ).toBeNull();
    const destinationFacts = comparablePortfolio(await snapshot());
    const destinationExtras = await extras();

    const upload = page.getByLabel("Original portfolio XLSX", { exact: true });
    await upload.setInputFiles({
      name: "original.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: original,
    });
    await page.getByRole("button", { name: "Preview recovery", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review portfolio recovery", exact: true })).toBeFocused();
    await page.getByLabel("Type REPLACE PORTFOLIO to confirm", { exact: true }).fill("REPLACE PORTFOLIO");
    await page.getByRole("button", { name: "Replace portfolio", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/dashboard`);
    await page.reload();
    expect(comparablePortfolio(await snapshot())).toEqual(originalFacts);
    expect((await extras()).observations).toEqual([]);

    await page.goto("/dashboard/portfolio");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Preview undo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review undo", exact: true })).toBeFocused();
    await page.getByLabel("Type REPLACE PORTFOLIO to confirm", { exact: true }).fill("REPLACE PORTFOLIO");
    await page.getByRole("button", { name: "Undo latest recovery", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/dashboard`);
    await page.reload();
    expect(comparablePortfolio(await snapshot())).toEqual(destinationFacts);
    expect(await extras()).toEqual(destinationExtras);

    // The server restores signed original facts, even if readable analysis cells were changed.
    const analysis = new ExcelJS.Workbook();
    await analysis.xlsx.load(Uint8Array.from(original).buffer);
    const readableWallets = analysis.getWorksheet("Wallets");
    const readableInvestments = analysis.getWorksheet("Investments");
    if (!readableWallets || !readableInvestments) throw new Error("Missing analysis sheets");
    readableWallets.getCell("C2").value = "1";
    readableInvestments.getCell("J2").value = { formula: "1+1", result: 2 };
    const edited = Buffer.from(await analysis.xlsx.writeBuffer());
    const previewResponse = await page.request.post("/dashboard/portfolio/preview", {
      headers: { Origin: origin },
      multipart: {
        file: {
          name: "analysis-copy.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: edited,
        },
      },
    });
    expect(previewResponse.status()).toBe(200);
    const verified = (await previewResponse.json()) as { token: string; source: { counts: { wallets: number } } };
    expect(verified.source.counts.wallets).toBe(3);
    const replaced = await page.request.post("/dashboard/portfolio/replace", {
      headers: { Origin: origin },
      multipart: {
        file: {
          name: "analysis-copy.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: edited,
        },
        token: verified.token,
        confirmation: "REPLACE PORTFOLIO",
      },
    });
    expect(replaced.status()).toBe(200);
    expect(comparablePortfolio(await snapshot())).toEqual(originalFacts);
  } finally {
    expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});
