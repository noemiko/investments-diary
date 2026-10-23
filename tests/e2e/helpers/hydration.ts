import type { Page } from "@playwright/test";

export async function waitForHydration(page: Page) {
  // Astro removes this SSR marker after each client island becomes interactive.
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}
