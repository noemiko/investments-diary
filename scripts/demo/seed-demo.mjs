import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { assertLocal, seedDemo } from "./lib/demo-data.mjs";
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--reset")) throw new Error("Usage: npm run seed:demo -- [--reset]");
const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
);
const origin = assertLocal(status.API_URL);
if (!status.SERVICE_ROLE_KEY) throw new Error("Local Supabase service key unavailable");
const admin = createClient(origin, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = await seedDemo(admin, process.env.DEMO_USER_PASSWORD, { reset: args.includes("--reset") });
console.log(
  `Local demo ready: ${result.email}. Sign in with the DEMO_USER_PASSWORD used when the account was created. Five Demo wallets; synthetic history for manual testing only. Every demo holding selects Apple and fresh demos include a linked AAPL holding: click Download prices on Positions to request a real quote. Existing edits and selected listings are preserved. No provider request was made by this loader.`,
);
