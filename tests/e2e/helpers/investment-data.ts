import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect } from "@playwright/test";
import type { ApiDatabase } from "../../../src/db/api.types";

export async function investmentData() {
  // Discover only this repository's local stack; keep keys out of logs.
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
  const url = new URL(status.API_URL);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("E2E fixtures require local Supabase");
  }
  if (new URL(process.env.SUPABASE_URL ?? "http://invalid").origin !== url.origin) {
    throw new Error("App and fixtures must use the same local Supabase");
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<ApiDatabase>(url.origin, status.SERVICE_ROLE_KEY, options);
  const author = createClient<ApiDatabase>(url.origin, status.ANON_KEY, options);
  const email = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("Set E2E_USERNAME and E2E_PASSWORD");
  const login = await author.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  if (!login.data.user) throw new Error("Missing local test user");
  const owner = login.data.user.id;
  const token = `E2E-${randomUUID()}`;

  const cleanup = async () => {
    // Include soft-deleted and partially saved records; never touch another run's data.
    const positions = await admin.from("positions").delete().eq("user_id", owner).eq("instrument", token);
    expect(positions.error).toBeNull();
    const categories = await admin.from("reason_categories").delete().eq("user_id", owner).eq("name", token);
    expect(categories.error).toBeNull();
    const wallets = await admin.from("wallets").delete().eq("user_id", owner).eq("name", token);
    expect(wallets.error).toBeNull();
    const checks = [
      ["positions", admin.from("positions").select("id").eq("user_id", owner).eq("instrument", token)],
      ["reason_categories", admin.from("reason_categories").select("id").eq("user_id", owner).eq("name", token)],
      ["wallets", admin.from("wallets").select("id").eq("user_id", owner).eq("name", token)],
    ] as const;
    for (const [table, query] of checks) {
      const remaining = await query;
      expect(remaining.error).toBeNull();
      expect(remaining.data, `${table}: test residue`).toEqual([]);
    }
  };

  try {
    const wallet = await author
      .from("wallets")
      .insert({ currency: "USD", currency_attested: true, user_id: owner, name: token, starting_value: "1000" });
    expect(wallet.error).toBeNull();
    const category = await author.from("reason_categories").insert({ user_id: owner, name: token });
    expect(category.error).toBeNull();
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { token, cleanup };
}
