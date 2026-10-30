import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import { createWallet } from "@/lib/services/wallets";

it("transports exact quote decimals through owner-authenticated RPCs and the effective-price view", async () => {
  const url = new URL(process.env.SUPABASE_TEST_URL ?? "http://invalid");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Local database required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_SERVICE_KEY ?? "", options);
  const author = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_ANON_KEY ?? "", options);
  const foreign = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_ANON_KEY ?? "", options);
  const users: string[] = [];
  try {
    for (const client of [author, foreign]) {
      const email = `market-price-${randomUUID()}@example.test`,
        password = randomUUID();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      users.push(created.data.user.id);
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
    }
    const owner = users[0];
    const wallet = await createWallet(author, owner, {
      name: "Quote transport",
      starting_value: "0",
      currency: "EUR",
      currency_attested: true,
    });
    if (!wallet.ok) throw new Error("Wallet fixture failed");
    const category = await author
      .from("reason_categories")
      .insert({ user_id: owner, name: "Quote transport" })
      .select("id")
      .single();
    if (category.error) throw category.error;
    const cache = await author
      .from("market_quote_cache")
      .insert({
        user_id: owner,
        provider: "yahoo",
        symbol: "TEST.DE",
        exchange: "GER",
        currency: "EUR",
        timezone: "Europe/Berlin",
        listing_name: "Test",
        exchange_name: "Xetra",
        instrument_type: "EQUITY",
      })
      .select("id")
      .single();
    if (cache.error) throw cache.error;
    const position = await author
      .from("positions")
      .insert({
        user_id: owner,
        wallet_id: wallet.id,
        category_id: category.data.id,
        instrument: "Original label",
        buy_date: "2026-01-01",
        buy_price: "0.00000001",
        quantity: "1",
        market_listing_id: cache.data.id,
      })
      .select("id")
      .single();
    if (position.error) throw position.error;
    for (const price of ["999999999999.99999999", "0.00000001"]) {
      const claim = await author.rpc("claim_market_quote_refresh", { in_cache_id: cache.data.id });
      expect(claim.error).toBeNull();
      if (!claim.data) throw new Error("Missing refresh claim");
      const saved = await author.rpc("finish_market_quote_refresh", {
        in_cache_id: cache.data.id,
        in_token: claim.data,
        in_outcome: "success",
        in_price: price,
        in_market_at: "2026-01-02T12:00:00Z",
        in_market_date: "2026-01-02",
        in_fetched_at: "2026-01-02T12:01:00Z",
        in_market_state: "REGULAR",
        in_delay_minutes: "15",
        in_source_interval_minutes: "15",
      });
      expect(saved.error).toBeNull();
      expect(saved.data).toBe(true);
      const effective = await author
        .from("position_effective_prices")
        .select("selected_price::text,selected_date,selected_source,wallet_currency,quote_currency,instrument")
        .eq("id", position.data.id)
        .single();
      expect(effective.error).toBeNull();
      expect(effective.data).toEqual({
        selected_price: price,
        selected_date: "2026-01-02",
        selected_source: "automatic",
        wallet_currency: "EUR",
        quote_currency: "EUR",
        instrument: "Original label",
      });
      const raw = await author.from("market_quote_cache").select("price::text").eq("id", cache.data.id).single();
      expect(raw.error).toBeNull();
      expect(raw.data?.price).toBe(price);
    }
    expect((await foreign.from("market_quote_cache").select("price::text").eq("id", cache.data.id)).data).toEqual([]);
    expect(
      (await foreign.from("position_effective_prices").select("selected_price::text").eq("id", position.data.id)).data,
    ).toEqual([]);
    expect((await foreign.rpc("claim_market_quote_refresh", { in_cache_id: cache.data.id })).data).toBeNull();
    const patch = await author.from("market_quote_cache").update({ price: "99" }).eq("id", cache.data.id);
    expect(patch.error).not.toBeNull();
    const claim = await author.rpc("claim_market_quote_refresh", { in_cache_id: cache.data.id });
    if (!claim.data) throw new Error("Missing final claim");
    const failed = await author.rpc("finish_market_quote_refresh", {
      in_cache_id: cache.data.id,
      in_token: claim.data,
      in_outcome: "timeout",
    });
    expect(failed.error).toBeNull();
    expect(failed.data).toBe(true);
    const retained = await author
      .from("position_effective_prices")
      .select("selected_price::text,selected_source,refresh_outcome,quote_state")
      .eq("id", position.data.id)
      .single();
    expect(retained.error).toBeNull();
    expect(retained.data).toEqual({
      selected_price: "0.00000001",
      selected_source: "automatic",
      refresh_outcome: "timeout",
      quote_state: "cooldown",
    });
  } finally {
    for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
