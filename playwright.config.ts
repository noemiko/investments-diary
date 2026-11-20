import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env")) process.loadEnvFile(".env");

// Astro default; override if this port is occupied.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: { baseURL, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: [/.*\.setup\.ts/, /decision-history\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "decision-history",
      testMatch: /decision-history\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: { cookies: [], origins: [] } },
    },
  ],
  webServer: {
    // Vercel adapter rejects astro preview; build first, then serve with dev.
    command: `npm run build && npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ASTRO_DEV_BACKGROUND: "1" },
  },
});
