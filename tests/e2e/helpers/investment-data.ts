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
  const symbol = `E2E${randomUUID().slice(0, 8).toUpperCase()}`;
  let walletId: string | undefined;
  let categoryId: string | undefined;
  let targetId: string | undefined;
  let receiptId: string | undefined;

  const cleanup = async () => {
    // Include soft-deleted and partially saved records; never touch another run's data.
    if (walletId) {
      expect((await admin.from("positions").delete().eq("user_id", owner).eq("wallet_id", walletId)).error).toBeNull();
      expect(
        (await admin.from("market_selection_receipts").delete().eq("user_id", owner).eq("wallet_id", walletId)).error,
      ).toBeNull();
    }
    if (targetId)
      expect(
        (await admin.from("market_listing_targets").delete().eq("user_id", owner).eq("id", targetId)).error,
      ).toBeNull();
    const categories = await admin.from("reason_categories").delete().eq("user_id", owner).eq("name", token);
    expect(categories.error).toBeNull();
    const wallets = await admin.from("wallets").delete().eq("user_id", owner).eq("name", token);
    expect(wallets.error).toBeNull();
    const checks = [
      ["positions", admin.from("positions").select("id").eq("user_id", owner).eq("instrument", symbol)],
      ["targets", admin.from("market_listing_targets").select("id").eq("user_id", owner).eq("symbol", symbol)],
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
      .insert({ currency: "USD", user_id: owner, name: token, starting_value: "1000" })
      .select("id")
      .single();
    if (wallet.error) throw wallet.error;
    walletId = wallet.data.id;
    const category = await author
      .from("reason_categories")
      .insert({ user_id: owner, name: token })
      .select("id")
      .single();
    if (category.error) throw category.error;
    categoryId = category.data.id;
    // Stand in for metadata search only; no quote exists or is fetched by this fixture.
    const target = await admin
      .from("market_listing_targets")
      .insert({
        user_id: owner,
        provider: "yahoo",
        symbol,
        listing_name: token,
        exchange: "NMS",
        exchange_name: "Nasdaq",
        instrument_type: "EQUITY",
      })
      .select("id")
      .single();
    if (target.error) throw target.error;
    targetId = target.data.id;
    const receipt = await admin
      .from("market_selection_receipts")
      .insert({ user_id: owner, wallet_id: walletId, target_id: targetId })
      .select("id")
      .single();
    if (receipt.error) throw receipt.error;
    receiptId = receipt.data.id;
  } catch (error) {
    await cleanup();
    throw error;
  }
  if (!walletId || !categoryId || !receiptId || !targetId) throw new Error("Incomplete selection fixture");
  const selectedWalletId = walletId;
  const selectedPosition = async () => {
    const result = await admin
      .from("positions")
      .select("instrument,market_target_id,market_listing_id,current_price::text")
      .eq("user_id", owner)
      .eq("wallet_id", selectedWalletId)
      .single();
    if (result.error) throw result.error;
    return result.data;
  };
  return { token, symbol, walletId, categoryId, receiptId, targetId, selectedPosition, cleanup };
}
