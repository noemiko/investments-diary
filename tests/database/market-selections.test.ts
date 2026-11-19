import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import { searchMarketSelections, readMarketSelection } from "@/lib/services/market-selections";
import { createPosition } from "@/lib/services/positions";
import { createMarketPriceService, type MarketDataProvider } from "@/lib/services/market-prices";
import type { MarketSelectionChoice, MarketQuote } from "@/types";

it("persists search selections without quotes, validates creation receipts and resolves mixed-wallet targets only on download", async () => {
  const url = new URL(process.env.SUPABASE_TEST_URL ?? "http://invalid");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Local database required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_SERVICE_KEY ?? "", options);
  const author = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_ANON_KEY ?? "", options);
  const foreign = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_ANON_KEY ?? "", options);
  const users: string[] = [];
  try {
    for (const client of [author, foreign]) {
      const email = `selection-${randomUUID()}@example.test`,
        password = randomUUID();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      users.push(created.data.user.id);
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
    }
    const owner = users[0];
    const wallets = await author
      .from("wallets")
      .insert([
        { user_id: owner, name: "US selection", starting_value: "100", currency: "USD" },
        { user_id: owner, name: "PL selection", starting_value: "100", currency: "PLN" },
      ])
      .select("id,currency");
    if (wallets.error) throw wallets.error;
    const usd = wallets.data.find((w) => w.currency === "USD")?.id;
    const pln = wallets.data.find((w) => w.currency === "PLN")?.id;
    if (!usd || !pln) throw new Error("Wallet fixtures missing");
    const category = await author
      .from("reason_categories")
      .insert({ user_id: owner, name: "Selection reasoning" })
      .select("id")
      .single();
    if (category.error) throw category.error;
    const candidate = {
      symbol: "AAPL",
      name: "Apple Inc.",
      exchange: "NMS",
      exchangeName: "NasdaqGS",
      instrumentType: "EQUITY" as const,
    };
    const quote: MarketQuote = {
      provider: "yahoo",
      listing: { ...candidate, currency: "USD", timezone: "America/New_York" },
      price: "12.12345678",
      marketAt: "2026-01-05T20:00:00Z",
      marketDate: "2026-01-05",
      fetchedAt: "2026-01-05T20:01:00Z",
      marketState: "CLOSED",
      delayMinutes: 15,
      sourceIntervalMinutes: 15,
      sourceName: null,
    };
    const provider: MarketDataProvider = {
      searchListings: vi.fn<MarketDataProvider["searchListings"]>(() =>
        Promise.resolve({ ok: true, listings: [candidate] }),
      ),
      confirmListing: vi.fn<MarketDataProvider["confirmListing"]>(() => Promise.resolve({ ok: true, quote })),
      fetchQuotes: vi.fn<MarketDataProvider["fetchQuotes"]>(() =>
        Promise.resolve({ ok: true, quotes: { AAPL: { ok: true, quote } } }),
      ),
    };
    async function search(walletId: string): Promise<MarketSelectionChoice> {
      const result = await searchMarketSelections(author, owner, walletId, "Apple", undefined, provider);
      if (!result.ok || !result.choices[0]) throw new Error("Selection fixture failed");
      return result.choices[0];
    }
    const usChoice = await search(usd),
      plChoice = await search(pln);
    expect(usChoice.targetId).toBe(plChoice.targetId);
    expect(usChoice).not.toHaveProperty("currency");
    expect(usChoice).not.toHaveProperty("timezone");
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
    expect((await author.from("market_quote_cache").select("id")).data).toEqual([]);
    expect(await readMarketSelection(foreign, users[1], usd, usChoice.receiptId)).toBeNull();
    expect(await readMarketSelection(author, owner, pln, usChoice.receiptId)).toBeNull();
    const input = {
      instrument: "Untrusted label",
      buy_date: "2026-01-01",
      opening_commission: "0",
      buy_price: "1",
      quantity: "2",
      broker_label: null,
      reason_text: "Retained reasoning",
      wallet_id: usd,
      category_id: category.data.id,
      new_category_name: null,
      listing_receipt_id: usChoice.receiptId,
    };
    for (const receipt of ["", randomUUID(), plChoice.receiptId]) {
      expect(
        await createPosition(author, owner, {
          ...input,
          category_id: null,
          new_category_name: "Must not be created",
          listing_receipt_id: receipt,
        }),
      ).toEqual({ ok: false, error: "selection_invalid" });
    }
    expect((await author.from("reason_categories").select("id").eq("name", "Must not be created")).data).toEqual([]);
    const usPosition = await createPosition(author, owner, input);
    const plPosition = await createPosition(author, owner, {
      ...input,
      wallet_id: pln,
      listing_receipt_id: plChoice.receiptId,
    });
    if (!usPosition.ok || !plPosition.ok) throw new Error("Saved selection fixture failed");
    // An existing unconfirmed position reaches the FK on update, even though the receipt guard
    // would reject a nonexistent wallet before the FK could be checked during insert.
    for (const [change, name] of [
      [{ wallet_id: randomUUID() }, "positions_wallet_fkey"],
      [{ category_id: randomUUID() }, "positions_category_id_user_id_fkey"],
    ] as const) {
      const { error } = await admin.from("positions").update(change).eq("id", usPosition.id);
      expect(error).toMatchObject({
        code: "23503",
        message: `insert or update on table "positions" violates foreign key constraint "${name}"`,
      });
    }
    expect(
      (
        await author
          .from("positions")
          .select("instrument,market_target_id,market_listing_id")
          .eq("id", usPosition.id)
          .single()
      ).data,
    ).toEqual({ instrument: "AAPL", market_target_id: usChoice.targetId, market_listing_id: null });
    expect(provider.confirmListing).not.toHaveBeenCalled();
    expect(provider.fetchQuotes).not.toHaveBeenCalled();
    expect((await foreign.from("market_listing_targets").select("id")).data).toEqual([]);
    expect((await foreign.from("market_selection_receipts").select("id")).data).toEqual([]);
    expect(
      (await author.from("market_listing_targets").update({ cooldown_until: null }).eq("id", usChoice.targetId)).error,
    ).not.toBeNull();
    expect(
      (
        await author
          .from("market_selection_receipts")
          .update({ valid_until: "2099-01-01T00:00:00Z" })
          .eq("id", usChoice.receiptId)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await foreign
          .from("market_selection_receipts")
          .insert({ user_id: users[1], wallet_id: usd, target_id: usChoice.targetId })
      ).error,
    ).not.toBeNull();
    expect((await foreign.rpc("claim_market_target", { in_target_id: usChoice.targetId })).data).toBeNull();
    const claims = await Promise.all([
      author.rpc("claim_market_target", { in_target_id: usChoice.targetId }),
      author.rpc("claim_market_target", { in_target_id: usChoice.targetId }),
    ]);
    for (const claim of claims) expect(claim.error).toBeNull();
    const tokens = claims.map((claim) => claim.data).filter(Boolean);
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    if (!token) throw new Error("Target lease missing");
    expect(
      (
        await foreign.rpc("finish_market_target", {
          in_target_id: usChoice.targetId,
          in_token: token,
          in_outcome: "cancelled",
          in_release: true,
        })
      ).data,
    ).toBe(-1);
    expect(
      (
        await admin
          .from("market_listing_targets")
          .update({ lease_until: "2020-01-01T00:00:00Z" })
          .eq("id", usChoice.targetId)
      ).error,
    ).toBeNull();
    const renewed = await author.rpc("claim_market_target", { in_target_id: usChoice.targetId });
    expect(renewed.error).toBeNull();
    if (!renewed.data) throw new Error("Expired target lease was not recovered");
    expect(renewed.data).not.toBe(token);
    expect(
      (
        await author.rpc("finish_market_target", {
          in_target_id: usChoice.targetId,
          in_token: token,
          in_outcome: "cancelled",
          in_release: true,
        })
      ).data,
    ).toBe(-1);
    expect(
      (
        await author.rpc("finish_market_target", {
          in_target_id: usChoice.targetId,
          in_token: renewed.data,
          in_outcome: "cancelled",
          in_release: true,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin
          .from("market_selection_receipts")
          .update({ valid_until: "2020-01-01T00:00:00Z" })
          .eq("id", usChoice.receiptId)
      ).error,
    ).toBeNull();
    expect(await createPosition(author, owner, input)).toEqual({ ok: false, error: "selection_invalid" });
    const { error: expiredInsert } = await author.from("positions").insert({
      user_id: owner,
      instrument: usChoice.symbol,
      buy_date: input.buy_date,
      buy_price: input.buy_price,
      quantity: input.quantity,
      category_id: input.category_id,
      wallet_id: usd,
      market_selection_receipt_id: usChoice.receiptId,
    });
    expect(expiredInsert).toMatchObject({
      code: "23514",
      message: "Choose a valid stock selection for this wallet",
    });
    // A saved target survives its original form receipt expiry; incompatible manual amounts stay unchanged.
    expect(
      (await author.from("positions").update({ current_price: "9", price_date: "2026-01-02" }).eq("id", plPosition.id))
        .error,
    ).toBeNull();
    const service = createMarketPriceService(author, owner, { provider });
    expect(await service.download()).toMatchObject({
      ok: true,
      results: [{ symbol: "AAPL", outcome: "incompatible_currency", incompatibleCount: 1 }],
    });
    expect(provider.confirmListing).toHaveBeenCalledOnce();
    const effective = await author
      .from("position_effective_prices")
      .select("id,selected_price::text,selected_source,market_target_id,quote_currency")
      .in("id", [usPosition.id, plPosition.id]);
    expect(effective.error).toBeNull();
    expect(effective.data?.find((p) => p.id === usPosition.id)).toMatchObject({
      selected_price: "12.12345678",
      selected_source: "automatic",
      quote_currency: "USD",
    });
    expect(effective.data?.find((p) => p.id === plPosition.id)).toMatchObject({
      selected_price: "9.00000000",
      selected_source: "manual",
      quote_currency: null,
      market_target_id: usChoice.targetId,
    });
    const another = await search(usd);
    const next = await createPosition(author, owner, { ...input, listing_receipt_id: another.receiptId });
    if (!next.ok) throw new Error("Second pending holding failed");
    await service.download();
    expect(provider.fetchQuotes).toHaveBeenCalledOnce();
    expect(provider.confirmListing).toHaveBeenCalledOnce();
    expect(
      (await author.from("positions").select("market_listing_id").eq("id", next.id).single()).data?.market_listing_id,
    ).not.toBeNull();
    // When metadata cannot distinguish two canonical identities, fail closed before provider work.
    expect(
      (await admin.from("market_listing_targets").update({ cache_id: null }).eq("id", usChoice.targetId)).error,
    ).toBeNull();
    expect(
      (
        await admin.from("market_quote_cache").insert({
          user_id: owner,
          provider: "yahoo",
          symbol: "AAPL",
          exchange: "NMS",
          currency: "USD",
          timezone: "UTC",
          listing_name: "Different identity",
          exchange_name: "NasdaqGS",
          instrument_type: "EQUITY",
        })
      ).error,
    ).toBeNull();
    expect(await service.download([plPosition.id])).toMatchObject({
      ok: true,
      results: [{ outcome: "invalid_quote" }],
    });
    expect(provider.fetchQuotes).toHaveBeenCalledOnce();
    expect(provider.confirmListing).toHaveBeenCalledOnce();
    expect((await author.rpc("claim_market_target", { in_target_id: usChoice.targetId })).data).toBeNull();
  } finally {
    for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
