import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import { createWallet } from "@/lib/services/wallets";
import { createMarketPriceService, type MarketDataProvider } from "@/lib/services/market-prices";
import type { MarketQuote } from "@/types";

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
    // The real service/repository creates a position-bound receipt from an injected provider,
    // then confirms it using saved server data without a second quote request.
    expect(
      (await admin.from("market_quote_cache").update({ cooldown_until: null }).eq("id", cache.data.id)).error,
    ).toBeNull();
    const providerQuote: MarketQuote = {
      provider: "yahoo",
      listing: {
        symbol: "TEST.DE",
        name: "Test",
        exchange: "GER",
        exchangeName: "Xetra",
        currency: "EUR",
        timezone: "Europe/Berlin",
        instrumentType: "EQUITY",
      },
      price: "16.12345678",
      marketAt: "2026-01-03T12:00:00Z",
      marketDate: "2026-01-03",
      fetchedAt: "2026-01-03T12:01:00Z",
      marketState: "CLOSED",
      delayMinutes: 15,
      sourceIntervalMinutes: 15,
      sourceName: null,
    };
    const provider: MarketDataProvider = {
      searchListings: vi.fn<MarketDataProvider["searchListings"]>(() => Promise.resolve({ ok: true, listings: [] })),
      confirmListing: vi.fn<MarketDataProvider["confirmListing"]>(() =>
        Promise.resolve({ ok: true, quote: providerQuote }),
      ),
      fetchQuotes: vi.fn<MarketDataProvider["fetchQuotes"]>(() =>
        Promise.resolve({ ok: true, quotes: { "TEST.DE": { ok: true, quote: providerQuote } } }),
      ),
    };
    const service = createMarketPriceService(author, owner, { provider });
    const downloaded = await service.lookup(position.data.id, "TEST.DE");
    expect(downloaded).toMatchObject({
      ok: true,
      listing: { currency: "EUR", exchange: "GER", timezone: "Europe/Berlin" },
      quote: { price: "16.12345678" },
    });
    if (!downloaded.ok) throw new Error("Lookup failed");
    expect(await service.confirm(position.data.id, downloaded.lookupId)).toEqual({ ok: true });
    expect(provider.fetchQuotes).toHaveBeenCalledOnce();
    expect(provider.confirmListing).not.toHaveBeenCalled();
    const lookupArgs = { in_lookup_id: downloaded.lookupId, in_position_id: position.data.id };
    expect((await foreign.from("market_listing_lookups").select("id").eq("id", downloaded.lookupId)).data).toEqual([]);
    expect((await foreign.rpc("claim_listing_lookup", { in_lookup_id: downloaded.lookupId })).data).toBeNull();
    expect((await foreign.rpc("confirm_listing_lookup", lookupArgs)).data).toBe(false);
    expect(
      (
        await foreign
          .from("market_listing_lookups")
          .insert({ user_id: users[1], position_id: position.data.id, symbol: "TEST.DE" })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await author
          .from("market_listing_lookups")
          .update({ valid_until: "2099-01-01T00:00:00Z" })
          .eq("id", downloaded.lookupId)
      ).error,
    ).not.toBeNull();
    const otherPosition = await author
      .from("positions")
      .insert({
        user_id: owner,
        wallet_id: wallet.id,
        category_id: category.data.id,
        instrument: "Other position",
        buy_date: "2026-01-01",
        buy_price: "1",
      })
      .select("id")
      .single();
    if (otherPosition.error) throw otherPosition.error;
    expect(
      (await author.rpc("confirm_listing_lookup", { ...lookupArgs, in_position_id: otherPosition.data.id })).data,
    ).toBe(false);
    // Concurrent REST calls must not both obtain a discovery lease.
    const claims = await Promise.all([
      author.rpc("claim_listing_lookup", { in_lookup_id: downloaded.lookupId }),
      author.rpc("claim_listing_lookup", { in_lookup_id: downloaded.lookupId }),
    ]);
    for (const c of claims) expect(c.error).toBeNull();
    const winning = claims.map((c) => c.data).filter((token): token is string => token !== null);
    expect(winning).toHaveLength(1);
    expect(
      (
        await admin
          .from("market_listing_lookups")
          .update({ lease_until: "2020-01-01T00:00:00Z" })
          .eq("id", downloaded.lookupId)
      ).error,
    ).toBeNull();
    const reclaimed = await author.rpc("claim_listing_lookup", { in_lookup_id: downloaded.lookupId });
    expect(reclaimed.error).toBeNull();
    expect(reclaimed.data).toBeTruthy();
    expect(reclaimed.data).not.toBe(winning[0]);
    expect(
      (
        await author.rpc("finish_listing_lookup", {
          in_lookup_id: downloaded.lookupId,
          in_token: winning[0],
          in_cache_id: cache.data.id,
        })
      ).data,
    ).toBe(false);
    if (!reclaimed.data) throw new Error("Missing recovered lookup lease");
    const released = await author.rpc("finish_listing_lookup", {
      in_lookup_id: downloaded.lookupId,
      in_token: reclaimed.data,
      in_release: true,
    });
    expect(released.error).toBeNull();
    expect(released.data).toBe(true);
    // Failed discovery keeps existing cache and respects longer provider Retry-After.
    const again = await author.rpc("claim_listing_lookup", { in_lookup_id: downloaded.lookupId });
    if (!again.data) throw new Error("Missing lookup lease");
    const retryAfter = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(
      (
        await author.rpc("finish_listing_lookup", {
          in_lookup_id: downloaded.lookupId,
          in_token: again.data,
          in_retry_after: retryAfter,
        })
      ).error,
    ).toBeNull();
    expect((await author.rpc("claim_listing_lookup", { in_lookup_id: downloaded.lookupId })).data).toBeNull();
    const receipt = await author
      .from("market_listing_lookups")
      .select("cache_id,cooldown_until")
      .eq("id", downloaded.lookupId)
      .single();
    expect(receipt.error).toBeNull();
    expect(receipt.data?.cache_id).toBe(cache.data.id);
    expect(Date.parse(receipt.data?.cooldown_until ?? "")).toBeGreaterThanOrEqual(Date.parse(retryAfter));
    expect(
      (
        await admin
          .from("market_listing_lookups")
          .update({ valid_until: "2020-01-01T00:00:00Z" })
          .eq("id", downloaded.lookupId)
      ).error,
    ).toBeNull();
    expect((await author.rpc("confirm_listing_lookup", lookupArgs)).data).toBe(false);
    expect(await service.confirm(position.data.id, downloaded.lookupId)).toEqual({
      ok: false,
      reason: "lookup_expired",
    });
    // Releasing unattempted quote work clears the lease without a failed-attempt cooldown.
    const refresh = await author.rpc("claim_market_quote_refresh", { in_cache_id: cache.data.id });
    if (!refresh.data) throw new Error("Missing quote release lease");
    expect(
      (await foreign.rpc("release_market_quote_refresh", { in_cache_id: cache.data.id, in_token: refresh.data })).data,
    ).toBe(false);
    expect(
      (await author.rpc("release_market_quote_refresh", { in_cache_id: cache.data.id, in_token: refresh.data })).data,
    ).toBe(true);
    const due = await author.rpc("claim_market_quote_refresh", { in_cache_id: cache.data.id });
    expect(due.data).toBeTruthy();
    if (due.data)
      expect(
        (await author.rpc("release_market_quote_refresh", { in_cache_id: cache.data.id, in_token: due.data })).data,
      ).toBe(true);
  } finally {
    for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
