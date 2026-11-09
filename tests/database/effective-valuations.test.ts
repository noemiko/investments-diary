import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import {
  getPosition,
  listPositions,
  listConfrontationPositions,
  movePosition,
  updatePositionPrice,
  closePosition,
  deletePosition,
  restorePosition,
} from "@/lib/services/positions";
import { listWalletPositions } from "@/lib/services/wallets";
import { walletValue } from "@/lib/wallet";
import { selectionReceipt } from "./selection-fixture";

it("uses identical cached effective values on all reads, preserving zero sales, manual corrections and move facts", async () => {
  const url = new URL(process.env.SUPABASE_TEST_URL ?? "http://invalid");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Local database required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_SERVICE_KEY ?? "", options);
  const author = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_ANON_KEY ?? "", options);
  const foreign = createClient<ApiDatabase>(url.origin, process.env.SUPABASE_TEST_ANON_KEY ?? "", options);
  const owners: string[] = [];
  try {
    for (const client of [author, foreign]) {
      const email = `effective-${randomUUID()}@example.test`,
        password = randomUUID();
      const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (user.error) throw user.error;
      owners.push(user.data.user.id);
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    }
    const owner = owners[0];
    const wallets = await author
      .from("wallets")
      .insert([
        { user_id: owner, name: "Source", starting_value: "1000", currency: "USD" },
        { user_id: owner, name: "Target", starting_value: "0", currency: "USD" },
        { user_id: owner, name: "Other currency", starting_value: "0", currency: "PLN" },
      ])
      .select("id,name");
    if (wallets.error) throw wallets.error;
    const source = wallets.data.find((w) => w.name === "Source")?.id,
      target = wallets.data.find((w) => w.name === "Target")?.id,
      other = wallets.data.find((w) => w.name === "Other currency")?.id;
    if (!source || !target || !other) throw new Error("Missing wallets");
    const category = await author
      .from("reason_categories")
      .insert({ user_id: owner, name: "Reason" })
      .select("id")
      .single();
    if (category.error) throw category.error;
    const cache = await author
      .from("market_quote_cache")
      .insert({
        user_id: owner,
        provider: "yahoo",
        symbol: "AAPL",
        exchange: "NMS",
        currency: "USD",
        timezone: "America/New_York",
        listing_name: "Apple",
        exchange_name: "Nasdaq",
        instrument_type: "EQUITY",
      })
      .select("id")
      .single();
    if (cache.error) throw cache.error;
    const claim = await author.rpc("claim_market_quote_refresh", { in_cache_id: cache.data.id });
    if (claim.error || !claim.data) throw new Error("Missing claim");
    expect(
      (
        await author.rpc("finish_market_quote_refresh", {
          in_cache_id: cache.data.id,
          in_token: claim.data,
          in_outcome: "success",
          in_price: "12.12345678",
          in_market_at: "2026-01-05T12:00:00Z",
          in_market_date: "2026-01-05",
          in_fetched_at: "2026-01-05T12:01:00Z",
          in_market_state: "CLOSED",
        })
      ).error,
    ).toBeNull();
    const positions = await author
      .from("positions")
      .insert([
        {
          user_id: owner,
          wallet_id: source,
          category_id: category.data.id,
          closing_commission: "0",
          instrument: "AAPL",
          market_selection_receipt_id: await selectionReceipt(author, owner, source, "AAPL"),
          opening_commission: "0",
          buy_price: "10",
          buy_date: "2026-01-01",
          quantity: "2",
        },
        {
          user_id: owner,
          wallet_id: source,
          category_id: category.data.id,
          instrument: "ZERO",
          market_selection_receipt_id: await selectionReceipt(author, owner, source, "ZERO"),
          opening_commission: "0",
          buy_price: "10",
          buy_date: "2026-01-01",
          quantity: "2",
          current_price: "99",
          price_date: "2026-01-02",
          closing_commission: "0",
          sell_price: "0",
          sell_date: "2026-01-03",
        },
      ])
      .select("id,instrument");
    if (positions.error) throw positions.error;
    // The selection guard labels each holding with its target symbol.
    const open = positions.data.find((p) => p.instrument === "AAPL")?.id,
      closed = positions.data.find((p) => p.instrument === "ZERO")?.id;
    if (!open || !closed) throw new Error("Missing positions");
    // A selected insert starts unlinked; link the verified cache as a download would.
    expect(
      (await admin.from("positions").update({ market_listing_id: cache.data.id }).eq("id", open)).error,
    ).toBeNull();
    const list = await listPositions(author),
      detail = await getPosition(author, open),
      confrontation = await listConfrontationPositions(author),
      summary = await listWalletPositions(author);
    expect(detail?.current_price).toBe("12.12345678");
    expect(detail?.valuation?.source).toBe("automatic");
    expect(list.find((p) => p.id === open)?.current_price).toBe(detail?.current_price);
    expect(confrontation.find((p) => p.id === open)?.current_price).toBe(detail?.current_price);
    expect(summary.find((p) => p.current_price === "12.12345678")?.wallet_id).toBe(source);
    expect(walletValue({ starting_value: "1000" }, list).value.units).toBe(
      walletValue({ starting_value: "1000" }, summary).value.units,
    );
    expect((await getPosition(author, closed))?.sell_price).toBe("0");
    expect(confrontation.find((p) => p.id === closed)?.sell_price).toBe("0");
    expect(await getPosition(foreign, open)).toBeNull();
    expect(await updatePositionPrice(author, open, { current_price: "15", price_date: "2026-01-02" })).toEqual({
      ok: true,
    });
    const corrected = await getPosition(author, open);
    expect(corrected?.current_price).toBe("15");
    expect(corrected?.valuation?.source).toBe("manual_override");
    expect(corrected?.valuation?.manualPrice).toBe("15");
    const before = await admin.from("positions").select("*").eq("id", closed).single();
    if (before.error) throw before.error;
    expect(await movePosition(author, closed, { wallet_id: other })).toEqual({
      ok: false,
      reason: "incompatible_currency",
    });
    expect(await movePosition(foreign, closed, { wallet_id: target })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await author.from("positions").update({ wallet_id: target }).eq("id", closed)).error?.code).toBe("42501");
    expect(await movePosition(author, closed, { wallet_id: target })).toEqual({ ok: true });
    const after = await admin.from("positions").select("*").eq("id", closed).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual({ ...before.data, wallet_id: target });
    // Ordinary owner writes retain their existing permissions after wallet_id becomes RPC-only.
    expect(
      await closePosition(author, open, { closing_commission: "0", sell_price: "16", sell_date: "2026-01-06" }),
    ).toEqual({ ok: true });
    expect(await deletePosition(author, open)).toEqual({ ok: true });
    expect(await restorePosition(author, open)).toEqual({ ok: true });
  } finally {
    for (const id of owners) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
