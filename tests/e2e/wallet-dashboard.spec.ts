import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ApiDatabase } from "../../src/db/api.types";
test.use({ hasTouch: true, storageState: { cookies: [], origins: [] } });
test("daily wallet dashboard: ranges, exact details, reload, keyboard, mobile and no-JS", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  const origin = new URL(status.API_URL);
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    new URL(process.env.SUPABASE_URL ?? "http://invalid").origin !== origin.origin
  )
    throw new Error("App and fixtures must use the same local Supabase");
  const admin = createClient<ApiDatabase>(origin.origin, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `chart-${randomUUID()}@example.test`,
    password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const owner = created.data.user.id;
  try {
    const w = await admin
      .from("wallets")
      .insert({
        currency: "USD",
        user_id: owner,
        name: "Daily chart fixture",
        starting_value: "1000",
      })
      .select("id")
      .single();
    if (w.error) throw w.error;
    const today = new Date().toISOString().slice(0, 10);
    const rows = [-120, -2, 0].map((offset, i) => {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
      return {
        wallet_id: w.data.id,
        user_id: owner,
        observation_day: day,
        captured_at: `${day}T00:00:00Z`,
        starting_value: "1000",
        currency: "USD",
        automatic_count: 0,
        manual_count: 0,
        value: String([950, 1050, 1140][i]),
        realised_change: String([-50, 50, 140][i]),
        open_change: "0",
        realised_count: 1,
        open_count: 0,
        not_counted: 0,
      };
    });
    expect((await admin.from("wallet_snapshots").insert(rows)).error).toBeNull();
    expect(
      (
        await page.request.post("/api/auth/signin", {
          form: { email, password },
          headers: { Origin: String(info.project.use.baseURL) },
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(302);
    await page.goto(`/dashboard/wallets/${w.data.id}`);
    const controls = page.getByRole("group", { name: "History period" });
    await expect(controls.getByRole("button", { name: "3 months", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Observation data (2)", { exact: true })).toBeVisible();
    await controls.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText("Observation data (3)", { exact: true })).toBeVisible();
    const first = page.locator('svg circle[role="button"]').first();
    await first.focus();
    await first.press("Enter");
    await expect(page.locator("[data-history-details]")).toContainText("950.00");
    await page.screenshot({
      path: info.outputPath("wallet-desktop.png"),
      fullPage: true,
      style: "astro-dev-toolbar { display: none !important; }",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('svg circle[role="button"]').last().tap();
    await expect(page.locator("[data-history-details]")).toContainText("1,140.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: info.outputPath("wallet-mobile.png"),
      fullPage: true,
      style: "astro-dev-toolbar { display: none !important; }",
    });
    expect(errors).toEqual([]);
    await page.reload();
    await expect(page.getByText("Observation data (2)", { exact: true })).toBeVisible();
    const nojs = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
      baseURL: info.project.use.baseURL,
    });
    try {
      const view = await nojs.newPage();
      await view.goto(`/dashboard/wallets/${w.data.id}`);
      await expect(view.getByRole("heading", { name: "Recorded daily wallet value" })).toBeVisible();
      await view.getByText("Observation data (2)", { exact: true }).click();
      await expect(view.getByRole("table").first()).toContainText("1,140.00");
    } finally {
      await nojs.close();
    }
    // The observer must work when the default period has no chart and after later remounts.
    expect((await admin.from("wallet_snapshots").delete().eq("wallet_id", w.data.id)).error).toBeNull();
    expect((await admin.from("wallet_snapshots").insert(rows[0])).error).toBeNull();
    await page.reload();
    await expect(page.getByText("No observations in this period. Choose a longer range.")).toBeVisible();
    await controls.getByRole("button", { name: "All", exact: true }).click();
    const chart = page.getByRole("group", { name: "Daily wallet value chart. Focus or tap a point for details." });
    const expectResponsiveChart = async () => {
      await expect(chart).toBeVisible();
      await expect
        .poll(() =>
          chart.evaluate((svg) =>
            Math.abs(svg.getBoundingClientRect().width - (svg as SVGSVGElement).viewBox.baseVal.width),
          ),
        )
        .toBeLessThan(2);
    };
    await expectResponsiveChart();
    await controls.getByRole("button", { name: "1 month", exact: true }).click();
    await expect(chart).toHaveCount(0);
    await controls.getByRole("button", { name: "All", exact: true }).click();
    await expectResponsiveChart();
    await page.setViewportSize({ width: 430, height: 844 });
    await expectResponsiveChart();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectResponsiveChart();

    // Dense flat history must select the day touched, regardless of overlapping hit circles.
    expect((await admin.from("wallet_snapshots").delete().eq("wallet_id", w.data.id)).error).toBeNull();
    const dense = Array.from({ length: 365 }, (_, index) => {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) + (index - 364) * 86400000).toISOString().slice(0, 10);
      return {
        ...rows[0],
        observation_day: day,
        captured_at: `${day}T00:00:00Z`,
        value: "1000",
        realised_change: "0",
        realised_count: 0,
      };
    });
    expect((await admin.from("wallet_snapshots").insert(dense)).error).toBeNull();
    await page.reload();
    await controls.getByRole("button", { name: "1 year", exact: true }).click();
    await expect(page.locator('svg circle[role="button"]')).toHaveCount(365);
    await page.addStyleTag({ content: "astro-dev-toolbar { display: none !important; }" });
    const middle = page.locator('svg circle[role="button"]').nth(180);
    await middle.scrollIntoViewIfNeeded();
    const center = await middle.evaluate((circle) => {
      const point = new DOMPoint(Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy")));
      const matrix = (circle as SVGCircleElement).getScreenCTM();
      if (!matrix) throw new Error("Chart has no screen transform");
      const screen = point.matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
    const expectedDay = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(dense[180].captured_at),
    );
    await page.touchscreen.tap(center.x, center.y);
    await expect(page.locator("[data-history-details]")).toContainText(expectedDay);
    await page.locator('svg circle[role="button"]').last().focus();
    await page.mouse.move(center.x, center.y);
    await expect(page.locator("[data-history-details]")).toContainText(expectedDay);
    await middle.focus();
    await middle.press("Enter");
    await expect(page.locator("[data-history-details]")).toContainText(expectedDay);
  } finally {
    expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});
