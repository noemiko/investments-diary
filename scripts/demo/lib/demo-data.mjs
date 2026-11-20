import { createHash } from "node:crypto";
export const DEMO_EMAIL = "wallet-demo@example.test";
export const DEMO_MARKER = "wallet-performance-v1";
const LINKED_POSITION_INDEX = 11;
// Pending selection metadata only; currency and timezone come from the first explicit download.
const APPLE_TARGET = {
  provider: "yahoo",
  symbol: "AAPL",
  exchange: "NMS",
  listing_name: "Apple Inc.",
  exchange_name: "NasdaqGS",
  instrument_type: "EQUITY",
};
const TARGET_IDENTITY = "user_id,provider,symbol,exchange,instrument_type";
export function fixtureId(owner, kind, index) {
  const hex = createHash("sha256").update(`${DEMO_MARKER}:${owner}:${kind}:${index}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function assertLocal(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    throw new Error("Demo seeding requires local Supabase");
  return parsed.origin;
}
const dayAt = (today, offset) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
export function demoFixtures(owner, today) {
  const labels = ["Rising", "Falling", "Mixed", "Flat", "Empty"];
  const wallets = labels.map((label, i) => ({
    id: fixtureId(owner, "wallet", i),
    user_id: owner,
    name: `Demo · ${label}`,
    starting_value: "10000",
    currency: "USD",
  }));
  const categories = ["Long-term growth", "Income", "Value", "Speculative"].map((name, i) => ({
    id: fixtureId(owner, "category", i),
    user_id: owner,
    name: `Demo · ${name}`,
  }));
  // Listing metadata only: the first real quote still requires an explicit download.
  const listings = [
    {
      id: fixtureId(owner, "listing", 0),
      user_id: owner,
      provider: "yahoo",
      symbol: "AAPL",
      exchange: "NMS",
      currency: "USD",
      timezone: "America/New_York",
      listing_name: "Apple Inc.",
      exchange_name: "NasdaqGS",
      instrument_type: "EQUITY",
    },
  ];
  const positions = Array.from({ length: 100 }, (_, i) => {
    const w = Math.floor(i / 25);
    const closed = i % 4 === 0;
    const absent = i % 11 === 0;
    const deleted = i % 17 === 0;
    // Keep synthetic prices near the $43 quotes used during manual testing.
    const price = w === 0 ? 48 : w === 1 ? 32 : w === 2 ? (i % 2 ? 52 : 28) : 40;
    return {
      id: fixtureId(owner, "position", i),
      user_id: owner,
      wallet_id: wallets[w].id,
      category_id: categories[i % 4].id,
      // Every holding needs a stock selection. Like migrated drafts, demo holdings select Apple,
      // and the selection guard labels each one with the selected symbol.
      instrument: APPLE_TARGET.symbol,
      market_listing_id: i === LINKED_POSITION_INDEX ? listings[0].id : null,
      buy_price: "40",
      buy_date: dayAt(today, -365),
      quantity: i % 13 === 0 ? null : "10",
      current_price: absent ? null : String(price),
      price_date: absent ? null : dayAt(today, -(i % 7)),
      sell_price: closed ? String(i === 4 ? 0 : price) : null,
      sell_date: closed ? dayAt(today, -30 - i) : null,
      deleted_at: deleted ? `${dayAt(today, -10)}T12:00:00Z` : null,
      broker_label: i % 2 ? "Demo Broker" : "Sample Brokerage",
      reason_text: `Synthetic demo reasoning ${i + 1}: ${["Long holding horizon", "Dividend income", "Undervalued business", "High uncertainty"][i % 4]}. For manual testing only.`,
    };
  });
  return { wallets, categories, positions, listings };
}
/** Derive current exact fixture totals, then create clearly synthetic historical variation. */
export function demoSnapshots(wallets, positions, today) {
  const snapshots = [];
  for (const [index, wallet] of wallets.entries()) {
    let realised = 0n,
      open = 0n,
      rc = 0,
      oc = 0,
      nc = 0,
      asOf = null;
    for (const p of positions.filter((p) => p.wallet_id === wallet.id && !p.deleted_at)) {
      if (p.quantity === null || (p.sell_price === null && p.current_price === null)) {
        nc++;
        continue;
      }
      const gain = (BigInt(p.sell_price ?? p.current_price) - BigInt(p.buy_price)) * BigInt(p.quantity);
      if (p.sell_price !== null) {
        realised += gain;
        rc++;
      } else {
        open += gain;
        oc++;
        if (asOf === null || p.price_date < asOf) asOf = p.price_date;
      }
    }
    for (let offset = -364; offset <= 0; offset++) {
      if (offset !== 0 && -offset % 19 === 0) continue;
      const trend =
        index === 0
          ? BigInt(offset * 5)
          : index === 1
            ? BigInt(-offset * 5)
            : index === 2
              ? BigInt(Math.round(Math.sin(offset / 12) * 300))
              : 0n;
      const r = realised;
      const o = open + trend;
      const day = dayAt(today, offset);
      snapshots.push({
        wallet_id: wallet.id,
        currency: wallet.currency,
        user_id: wallet.user_id,
        observation_day: day,
        captured_at: `${day}T00:00:00Z`,
        starting_value: wallet.starting_value,
        value: String(BigInt(wallet.starting_value) + r + o),
        realised_change: String(r),
        open_change: String(o),
        realised_count: rc,
        open_count: oc,
        not_counted: nc,
        as_of: oc ? dayAt(day, -3) : null,
      });
    }
    // Latest synthetic snapshot must exactly match the live fixture freshness too.
    snapshots[snapshots.length - 1].as_of = asOf;
  }
  return snapshots;
}
function checked(result) {
  if (result.error) throw new Error(`Demo database operation failed (${result.error.code ?? "unknown"})`);
  return result.data;
}
/**
 * Create (or reuse) the owner's Apple target and one fresh wallet-bound receipt per wallet, the same
 * path the new-investment form uses. Receipts expire, so every run creates new ones.
 */
export async function demoSelectionReceipts(admin, owner, walletIds) {
  checked(
    await admin
      .from("market_listing_targets")
      .upsert({ user_id: owner, ...APPLE_TARGET }, { onConflict: TARGET_IDENTITY, ignoreDuplicates: true }),
  );
  let query = admin.from("market_listing_targets").select("id").eq("user_id", owner);
  for (const key of ["provider", "symbol", "exchange", "instrument_type"]) query = query.eq(key, APPLE_TARGET[key]);
  const targetId = checked(await query.single()).id;
  const receipts = checked(
    await admin
      .from("market_selection_receipts")
      .insert(walletIds.map((wallet_id) => ({ user_id: owner, wallet_id, target_id: targetId })))
      .select("id,wallet_id"),
  );
  return new Map(receipts.map((receipt) => [receipt.wallet_id, receipt.id]));
}
async function all(query) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const page = checked(await query().range(from, from + 499));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export async function seedDemo(
  admin,
  password,
  { reset = false, today = new Date().toISOString().slice(0, 10), email = DEMO_EMAIL } = {},
) {
  if (!password || password.length < 12) throw new Error("Set DEMO_USER_PASSWORD to at least 12 characters");
  let user = null;
  for (let page = 1; ; page++) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw new Error("Cannot inspect local demo users");
    user = result.data.users.find((u) => u.email === email) ?? user;
    if (user || result.data.users.length < 100) break;
  }
  if (user && user.app_metadata?.demo_seed !== DEMO_MARKER)
    throw new Error("Demo email belongs to an unmarked account; refusing changes");
  if (!user) {
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { demo_seed: DEMO_MARKER, demo_day: today },
    });
    if (r.error) throw new Error("Cannot create local demo account");
    user = r.data.user;
  }
  const owner = user.id;
  const seedDay = user.app_metadata.demo_day ?? today;
  const fixtures = demoFixtures(owner, seedDay);
  const walletIds = fixtures.wallets.map((w) => w.id),
    categoryIds = fixtures.categories.map((c) => c.id),
    positionIds = fixtures.positions.map((p) => p.id);
  const listing = fixtures.listings[0];
  const identity = ["user_id", "provider", "symbol", "exchange", "currency", "timezone", "instrument_type"];
  if (reset) {
    const cachedFixture = checked(
      await admin.from("market_quote_cache").select(identity.join(",")).eq("id", listing.id).maybeSingle(),
    );
    if (cachedFixture && identity.some((key) => cachedFixture[key] !== listing[key]))
      throw new Error("Reset found an unrelated listing identity; no fixtures changed");
    const references = await all(() =>
      admin.from("positions").select("id,wallet_id,category_id,market_listing_id").eq("user_id", owner).order("id"),
    );
    const unrelated = references.filter((p) => !positionIds.includes(p.id));
    const resetWalletIds = walletIds.filter((id) => !unrelated.some((p) => p.wallet_id === id));
    const resetCategoryIds = categoryIds.filter((id) => !unrelated.some((p) => p.category_id === id));
    const lookups = await all(() =>
      admin
        .from("market_listing_lookups")
        .select("id,position_id")
        .eq("user_id", owner)
        .eq("cache_id", fixtures.listings[0].id)
        .order("id"),
    );
    const preserveListing =
      unrelated.some((p) => p.market_listing_id === listing.id) ||
      lookups.some((lookup) => !positionIds.includes(lookup.position_id));
    checked(await admin.from("wallet_snapshots").delete().eq("user_id", owner).in("wallet_id", walletIds));
    checked(await admin.from("positions").delete().eq("user_id", owner).in("id", positionIds));
    // Retain shared parents and pending selections used by manually added investments.
    if (resetWalletIds.length)
      checked(
        await admin.from("market_selection_receipts").delete().eq("user_id", owner).in("wallet_id", resetWalletIds),
      );
    if (!preserveListing) {
      checked(
        await admin
          .from("market_listing_targets")
          .update({ cache_id: null })
          .eq("user_id", owner)
          .eq("cache_id", listing.id),
      );
      checked(await admin.from("market_quote_cache").delete().eq("user_id", owner).eq("id", listing.id));
    }
    if (resetCategoryIds.length)
      checked(await admin.from("reason_categories").delete().eq("user_id", owner).in("id", resetCategoryIds));
    if (resetWalletIds.length)
      checked(await admin.from("wallets").delete().eq("user_id", owner).in("id", resetWalletIds));
  }
  // A user's already-existing canonical listing is shared unchanged, never overwritten.
  // Fresh accounts get our deterministic metadata-only cache row, before any FK links.
  checked(
    await admin.from("market_quote_cache").upsert(listing, {
      onConflict: identity.join(","),
      ignoreDuplicates: true,
    }),
  );
  let listingQuery = admin.from("market_quote_cache").select("id");
  for (const key of identity) listingQuery = listingQuery.eq(key, listing[key]);
  const listingId = checked(await listingQuery.single()).id;
  // Duplicate keys are ignored, not updated, so normal reruns preserve manual changes.
  for (const [table, rows] of [
    ["wallets", fixtures.wallets],
    ["reason_categories", fixtures.categories],
  ])
    checked(await admin.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true }));
  // Selected inserts start unlinked (the guard clears market_listing_id); the repair step below
  // links the demo AAPL holding to its listing.
  const receipts = await demoSelectionReceipts(admin, owner, walletIds);
  const positions = fixtures.positions.map((position) => ({
    ...position,
    market_listing_id: null,
    market_selection_receipt_id: receipts.get(position.wallet_id),
  }));
  checked(await admin.from("positions").upsert(positions, { onConflict: "id", ignoreDuplicates: true }));
  // Upgrade older demos without resubmitting manual fields or changing user-selected listings.
  const target = checked(
    await admin
      .from("positions")
      .select("wallet_id")
      .eq("user_id", owner)
      .eq("id", positions[LINKED_POSITION_INDEX].id)
      .is("market_listing_id", null)
      .is("deleted_at", null)
      .is("sell_price", null)
      .is("sell_date", null)
      .maybeSingle(),
  );
  if (target) {
    const wallet = checked(
      await admin
        .from("wallets")
        .select("currency,deleted_at")
        .eq("user_id", owner)
        .eq("id", target.wallet_id)
        .single(),
    );
    if (wallet.currency === listing.currency && wallet.deleted_at === null)
      checked(
        await admin
          .from("positions")
          .update({ market_listing_id: listingId })
          .eq("user_id", owner)
          .eq("id", positions[LINKED_POSITION_INDEX].id)
          .eq("wallet_id", target.wallet_id)
          .is("market_listing_id", null)
          .is("deleted_at", null)
          .is("sell_price", null)
          .is("sell_date", null),
      );
  }
  // Freeze synthetic history on first seed. Reruns do not rewrite it or fabricate a new observation day.
  {
    const snapshots = demoSnapshots(fixtures.wallets, fixtures.positions, seedDay);
    for (let i = 0; i < snapshots.length; i += 200)
      checked(
        await admin
          .from("wallet_snapshots")
          .upsert(snapshots.slice(i, i + 200), { onConflict: "wallet_id,observation_day", ignoreDuplicates: true }),
      );
  }
  return { owner, email };
}
