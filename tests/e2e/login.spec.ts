import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { waitForHydration } from "./helpers/hydration";

test.use({ storageState: { cookies: [], origins: [] } });

const genericFailure = "Unable to sign in. Check your email and password and try again.";
const fictionalEmail = "investor@example.test";

test.beforeEach(({ baseURL }) => {
  const url = new URL(baseURL ?? "");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Authentication regression tests require local HTTP");
  }
});

async function openLogin(page: Page, query = "") {
  await page.goto(`/auth/signin${query}`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
}

async function capture(page: Page, testInfo: TestInfo, state: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const path = testInfo.outputPath(`${state}.png`);
  await page.screenshot({
    path,
    fullPage: true,
    animations: "disabled",
    style: "astro-dev-toolbar { display: none !important; }",
  });
  await testInfo.attach(state, { path, contentType: "image/png" });
}

// Call only after the POST transport has completed: script evaluation can stall
// while Chromium holds a pending native navigation.
async function expectNativePending(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
        const email = document.querySelector<HTMLInputElement>("#email");
        const password = document.querySelector<HTMLInputElement>("#password");
        return {
          disabled: button?.disabled,
          buttonText: button?.textContent.trim(),
          announcement: document.querySelector('[role="status"]')?.textContent.trim(),
          emailEnabled: !!email && !email.disabled,
          passwordEnabled: !!password && !password.disabled,
          busy: document.querySelector("form")?.getAttribute("aria-busy"),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      }),
    )
    .toEqual({
      disabled: true,
      buttonText: "Signing in…",
      announcement: "Signing in…",
      emailEnabled: true,
      passwordEnabled: true,
      busy: "true",
      overflow: false,
    });
}

test("validation focuses the first invalid field and links its description", async ({ page }) => {
  await openLogin(page);
  const email = page.getByLabel("Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await password.press("Enter");
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-describedby", "email-error");
  await expect(email).toHaveAccessibleDescription("Email is required");
  await expect(password).toHaveAccessibleDescription("Password is required");

  await email.fill("bad-email");
  await expect(email).toBeFocused();
  await email.press("Enter");
  await expect(email).toHaveAccessibleDescription("Enter a valid email address");
  await email.fill(fictionalEmail);
  // Clearing the email error must not steal focus while password remains invalid.
  await expect(email).toBeFocused();
  await email.press("Enter");
  await expect(password).toBeFocused();
  await password.fill("fictional-password");
  const toggle = page.getByRole("button", { name: "Show password", exact: true });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await toggle.press("Space");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("unknown server error text becomes a focused generic alert", async ({ page }) => {
  await openLogin(page, "?error=" + encodeURIComponent("private provider detail"));
  await expect(page.getByRole("alert")).toHaveText(genericFailure);
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("private provider detail");
});

test("native POST sends credentials once and history restores an idle empty password", async ({ page }) => {
  await openLogin(page);
  const attempts: boolean[] = [];
  await page.exposeBinding("recordSignInAttempt", (_source, prevented: boolean) => {
    attempts.push(prevented);
  });
  await page.evaluate(() => {
    const record = (window as unknown as { recordSignInAttempt: (prevented: boolean) => Promise<void> })
      .recordSignInAttempt;
    let first = true;
    document.addEventListener("submit", (event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      void record(event.defaultPrevented);
      if (!first) return;
      first = false;
      const form = event.target;
      // Run after initial event dispatch, before native navigation freezes this
      // document. The nested events must reach React and be canceled by its guard.
      queueMicrotask(() => {
        form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
        form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      });
    });
  });
  let submissions = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/signin", async (route) => {
    submissions++;
    const values = new URLSearchParams(route.request().postData() ?? "");
    expect(values.get("email")).toBe(fictionalEmail);
    expect(values.get("password")).toBe(" fictional-password ");
    await held;
    // A 204 completes the transport without replacing the page. The pending UI
    // stays in the original document so real back navigation can test its reset.
    await route.fulfill({ status: 204 });
  });
  try {
    await test.step("submit one native POST and hold it at the network layer", async () => {
      await page.getByLabel("Email", { exact: true }).fill(fictionalEmail);
      await page.getByLabel("Password", { exact: true }).fill(" fictional-password ");
      await page.getByLabel("Password", { exact: true }).press("Enter", { noWaitAfter: true });
      // Do not evaluate in the page here: Chromium can stall script evaluation
      // while a native navigation is held. The pending UI is asserted after release.
      await expect.poll(() => submissions).toBe(1);
    });
    await test.step("reject repeated submissions while the original POST is pending", async () => {
      await expect.poll(() => attempts).toEqual([false, true, true]);
      expect(submissions).toBe(1);
    });
    await test.step("finish the held transport without replacing the pending document", async () => {
      const completed = page.waitForResponse(
        (response) => response.url().endsWith("/api/auth/signin") && response.request().method() === "POST",
      );
      release?.();
      expect((await completed).status()).toBe(204);
      await page.unrouteAll({ behavior: "wait" });
      await expectNativePending(page);
      expect(submissions).toBe(1);
    });
    await test.step("navigate away and use browser history to restore an idle form", async () => {
      await page.goto("/auth/signin?error=invalid_input");
      await page.goBack();
      await waitForHydration(page);
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
      expect(submissions).toBe(1);
    });
  } finally {
    // Unblock the route even when an assertion fails. Test-page disposal removes
    // its routes; cleanup must not mask an earlier failure with a closed-page error.
    release?.();
  }
});

test("login without JavaScript restores a nested destination and retains private cookies", async ({
  browser,
  baseURL,
}) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) throw new Error("Local E2E credentials are required");
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const page = await context.newPage();
    await page.goto("/dashboard/wallets?range=30");
    await expect(page).toHaveURL("/auth/signin?returnTo=%2Fdashboard%2Fwallets%3Frange%3D30");
    await expect(page.getByRole("button", { name: "Show password", exact: true })).toHaveCount(0);
    await expect(page.locator("form")).not.toHaveAttribute("novalidate", "");
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("required", "");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("required", "");
    await page.getByLabel("Email", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/dashboard/wallets?range=30");
    const cookies = (await context.cookies()).filter((cookie) => /-auth-token(?:\.\d+)?$/.test(cookie.name));
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("Lax");
      expect(cookie.path).toBe("/");
    }
    await page.reload();
    await expect(page).toHaveURL("/dashboard/wallets?range=30");
    // This is an independent login, so disposing it does not revoke the shared setup session.
  } finally {
    await context.close();
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
]) {
  test(`login states at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLogin(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const preview = page.getByRole("region", { name: "Illustrative portfolio", exact: true });
    if (viewport.width < 768) await expect(preview).toBeHidden();
    else await expect(preview).toBeVisible();
    await capture(page, testInfo, "default");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Email", { exact: true })).toHaveAccessibleDescription("Email is required");
    await capture(page, testInfo, "validation-error");
    await openLogin(page, "?error=signin_failed");
    await expect(page.getByRole("alert")).toHaveText(genericFailure);
    await capture(page, testInfo, "server-error");
    await openLogin(page);
    // A 204 ends the native POST without replacing the document, so the pending
    // UI stays put and can be inspected without racing a held navigation.
    await page.route("**/api/auth/signin", (route) => route.fulfill({ status: 204 }));
    const completed = page.waitForResponse((response) => response.url().endsWith("/api/auth/signin"));
    await page.getByLabel("Email", { exact: true }).fill(fictionalEmail);
    await page.getByLabel("Password", { exact: true }).fill("fictional-password");
    await page.getByLabel("Password", { exact: true }).press("Enter", { noWaitAfter: true });
    expect((await completed).status()).toBe(204);
    await expectNativePending(page);
    await capture(page, testInfo, "pending");
  });
}
