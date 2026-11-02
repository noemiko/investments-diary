import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertLocal, demoFixtures, demoSelectionReceipts, demoSnapshots, seedDemo } from "../lib/demo-data.mjs";
test("nonlocal origins rejected and synthetic latest totals agree with fixture arithmetic", () => {
  for (const url of ["https://localhost", "https://example.com", "http://127.0.0.1.evil.test"])
    assert.throws(() => assertLocal(url));
  const f = demoFixtures("fixture", "2026-10-28");
  assert.equal(f.positions.length, 100);
  assert.equal(f.wallets.length, 5);
  const linked = f.positions[11];
  // Every demo holding selects Apple; the selection guard labels it with the symbol.
  assert.ok(f.positions.every((p) => p.instrument === "AAPL"));
  assert.equal(linked.market_listing_id, f.listings[0].id);
  assert.equal(linked.current_price, null);
  assert.equal(linked.sell_price, null);
  assert.equal(linked.deleted_at, null);
  assert.equal(linked.quantity, "10");
  assert.equal(f.listings[0].symbol, "AAPL");
  assert.equal(f.listings[0].currency, "USD");
  assert.equal(Object.hasOwn(f.listings[0], "price"), false);
  const zeroSale = f.positions[4];
  assert.equal(zeroSale.sell_price, "0");
  assert.equal(zeroSale.quantity, "10");
  assert.equal(zeroSale.deleted_at, null);
  assert.notEqual(zeroSale.sell_date, null);
  const points = demoSnapshots(f.wallets, f.positions, "2026-10-28");
  // Five other counted closed positions gain 100 each; the zero sale loses 500.
  // The resulting realised total must be zero, not 500 (sale excluded) or 600 (quote used).
  const latestRising = points.filter((p) => p.wallet_id === zeroSale.wallet_id).at(-1);
  assert.equal(latestRising.realised_count, 6);
  assert.equal(latestRising.realised_change, "0");
  for (const wallet of f.wallets) {
    const own = points.filter((p) => p.wallet_id === wallet.id);
    assert(own.length < 365);
    const last = own.at(-1);
    let sum = 10000;
    for (const p of f.positions.filter(
      (p) =>
        p.wallet_id === wallet.id &&
        !p.deleted_at &&
        p.quantity !== null &&
        (p.sell_price !== null || p.current_price !== null),
    ))
      sum += (Number(p.sell_price ?? p.current_price) - 50) * 10;
    assert.equal(last.value, String(sum));
  }
});
test("local demo creation, preservation, repair, reset, unrelated references and collision refusal", async () => {
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  );
  const admin = createClient(assertLocal(status.API_URL), status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `demo-test-${randomUUID()}@example.test`,
    password = randomUUID();
  let owner;
  const ok = (r) => {
    assert.equal(r.error, null);
    return r.data;
  };
  try {
    ({ owner } = await seedDemo(admin, password, { email, today: "2026-10-28" }));
    const f = demoFixtures(owner, "2026-10-28");
    const readPosition = async () =>
      ok(await admin.from("positions").select("*").eq("id", f.positions[11].id).single());
    const readListing = async (id = f.listings[0].id) =>
      ok(await admin.from("market_quote_cache").select("*").eq("id", id).single());
    const positionFacts = ({ market_listing_id, listing_confirmed_at, updated_at, ...facts }) => facts;
    assert.equal(ok(await admin.from("positions").select("id").eq("user_id", owner)).length, 100);
    assert.equal((await readPosition()).market_listing_id, f.listings[0].id);
    const freshListing = await readListing();
    for (const field of ["price", "market_at", "market_date", "fetched_at", "attempted_at"])
      assert.equal(freshListing[field], null);
    assert.equal(freshListing.refresh_outcome, "never");
    // Upgrade the old, unlinked fixture without replacing an edited label/manual correction.
    ok(
      await admin
        .from("positions")
        .update({ market_listing_id: null, instrument: "MY APPLE", current_price: "77", price_date: "2026-10-28" })
        .eq("id", f.positions[11].id),
    );
    const unlinkedFacts = positionFacts(await readPosition());
    ok(await admin.from("positions").update({ instrument: "MANUAL EDIT" }).eq("id", f.positions[0].id));
    ok(
      await admin
        .from("wallet_snapshots")
        .delete()
        .eq("wallet_id", f.wallets[0].id)
        .eq("observation_day", "2026-10-28"),
    );
    await seedDemo(admin, password, { email, today: "2026-10-29" });
    assert.equal((await readPosition()).market_listing_id, f.listings[0].id);
    assert.deepEqual(positionFacts(await readPosition()), unlinkedFacts);
    assert.deepEqual(await readListing(), freshListing);
    assert.equal(
      ok(await admin.from("positions").select("instrument").eq("id", f.positions[0].id).single()).instrument,
      "MANUAL EDIT",
    );
    assert.equal(
      ok(
        await admin
          .from("wallet_snapshots")
          .select("wallet_id")
          .eq("wallet_id", f.wallets[0].id)
          .eq("observation_day", "2026-10-28"),
      ).length,
      1,
    );
    const alternate = { ...f.listings[0], id: randomUUID(), symbol: "MSFT", listing_name: "Microsoft Corporation" };
    ok(await admin.from("market_quote_cache").insert(alternate));
    ok(await admin.from("positions").update({ market_listing_id: alternate.id }).eq("id", f.positions[11].id));
    await seedDemo(admin, password, { email });
    assert.equal((await readPosition()).market_listing_id, alternate.id);
    assert.deepEqual(positionFacts(await readPosition()), unlinkedFacts);
    // Closed and deleted old demo holdings must never be linked by the repair step.
    for (const state of [{ sell_price: "80", sell_date: "2026-10-28" }, { deleted_at: "2026-10-28T12:00:00Z" }]) {
      ok(
        await admin
          .from("positions")
          .update({ market_listing_id: null, sell_price: null, sell_date: null, deleted_at: null, ...state })
          .eq("id", f.positions[11].id),
      );
      const before = await readPosition();
      await seedDemo(admin, password, { email });
      assert.deepEqual(await readPosition(), before);
    }
    await seedDemo(admin, password, { email, reset: true, today: "2026-10-29" });
    assert.equal((await readPosition()).market_listing_id, f.listings[0].id);
    assert.equal((await readPosition()).current_price, null);
    assert.equal((await readPosition()).instrument, "AAPL");
    assert.equal((await readListing(alternate.id)).symbol, "MSFT");
    assert.equal(
      ok(await admin.from("positions").select("instrument").eq("id", f.positions[0].id).single()).instrument,
      "AAPL",
    );
    const receiptFor = async (walletId) => (await demoSelectionReceipts(admin, owner, [walletId])).get(walletId);
    const extra = {
      ...f.positions[1],
      id: randomUUID(),
      instrument: "Unrelated manually added",
      market_selection_receipt_id: await receiptFor(f.positions[1].wallet_id),
    };
    ok(await admin.from("positions").insert(extra));
    await assert.rejects(seedDemo(admin, password, { email, reset: true }), /unrelated/);
    assert.equal(ok(await admin.from("positions").select("id").eq("id", extra.id)).length, 1);
    ok(await admin.from("positions").delete().eq("id", extra.id));
    // A position outside every fixture wallet/category can still hold a fixture cache reference.
    const unrelatedWallet = { ...f.wallets[0], id: randomUUID(), name: "Unrelated wallet" };
    ok(await admin.from("wallets").insert(unrelatedWallet));
    const unrelatedCategory = { ...f.categories[0], id: randomUUID(), name: "Unrelated category" };
    ok(await admin.from("reason_categories").insert(unrelatedCategory));
    const outside = {
      ...f.positions[11],
      id: randomUUID(),
      wallet_id: unrelatedWallet.id,
      category_id: unrelatedCategory.id,
      instrument: "Unrelated linked stock",
      market_listing_id: null,
      market_selection_receipt_id: await receiptFor(unrelatedWallet.id),
    };
    ok(await admin.from("positions").insert(outside));
    // A selected insert starts unlinked; link the fixture cache as a confirmed listing would.
    ok(await admin.from("positions").update({ market_listing_id: f.listings[0].id }).eq("id", outside.id));
    const beforeRefusal = await readPosition();
    await assert.rejects(seedDemo(admin, password, { email, reset: true }), /unrelated/);
    assert.deepEqual(await readPosition(), beforeRefusal);
    ok(await admin.from("positions").update({ market_listing_id: null }).eq("id", outside.id));
    ok(
      await admin.from("market_listing_lookups").insert({
        user_id: owner,
        position_id: outside.id,
        symbol: "AAPL",
        cache_id: f.listings[0].id,
        valid_until: "2099-01-01T00:00:00Z",
      }),
    );
    await assert.rejects(seedDemo(admin, password, { email, reset: true }), /unrelated listing lookups/);
    assert.deepEqual(await readPosition(), beforeRefusal);
    ok(await admin.from("positions").delete().eq("id", outside.id));
    // Canonical owner-bound cache rows with different IDs are reused without touching real quotes.
    ok(await admin.from("positions").update({ market_listing_id: null }).eq("id", f.positions[11].id));
    ok(await admin.from("market_quote_cache").delete().eq("id", f.listings[0].id));
    const canonical = {
      ...f.listings[0],
      id: randomUUID(),
      price: "199.12345678",
      market_at: "2026-10-27T20:00:00Z",
      market_date: "2026-10-27",
      fetched_at: "2026-10-27T20:01:00Z",
      market_state: "CLOSED",
      refresh_outcome: "success",
    };
    ok(await admin.from("market_quote_cache").insert(canonical));
    const canonicalBefore = await readListing(canonical.id);
    const manualBefore = positionFacts(await readPosition());
    const readLatestSnapshot = async () =>
      ok(
        await admin
          .from("wallet_snapshots")
          .select("*")
          .eq("wallet_id", f.wallets[0].id)
          .eq("observation_day", "2026-10-28")
          .single(),
      );
    const historyBefore = await readLatestSnapshot();
    await seedDemo(admin, password, { email });
    assert.equal((await readPosition()).market_listing_id, canonical.id);
    assert.deepEqual(positionFacts(await readPosition()), manualBefore);
    assert.deepEqual(await readListing(canonical.id), canonicalBefore);
    assert.deepEqual(await readLatestSnapshot(), historyBefore);
    await seedDemo(admin, password, { email, reset: true });
    assert.equal((await readPosition()).market_listing_id, canonical.id);
    assert.deepEqual(await readListing(canonical.id), canonicalBefore);
    // Existing unmarked account must never be adopted or modified.
    ok(await admin.auth.admin.updateUserById(owner, { app_metadata: { demo_seed: null } }));
    await assert.rejects(seedDemo(admin, password, { email }), /unmarked/);
  } finally {
    if (owner) ok(await admin.auth.admin.deleteUser(owner));
  }
});
