import { execFileSync, spawnSync } from "node:child_process";

// Discover only this project's running local stack. Never print its keys or use hosted credentials.
const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
);
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
  throw new Error("Decimal database tests require local Supabase");
}
if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Missing local Supabase test keys");
const result = spawnSync("npx", ["vitest", "run", "--config", "vitest.database.config.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_TEST_URL: url.origin,
    SUPABASE_TEST_ANON_KEY: status.ANON_KEY,
    SUPABASE_TEST_SERVICE_KEY: status.SERVICE_ROLE_KEY,
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
