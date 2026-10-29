import { createHash } from "node:crypto";
export const DEMO_EMAIL = "wallet-demo@example.test";
export const DEMO_MARKER = "wallet-performance-v1";
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
  }));
  const categories = ["Long-term growth", "Income", "Value", "Speculative"].map((name, i) => ({
    id: fixtureId(owner, "category", i),
    user_id: owner,
    name: `Demo · ${name}`,
  }));
  const positions = Array.from({ length: 100 }, (_, i) => {
    const w = Math.floor(i / 25);
    const closed = i % 4 === 0;
    const absent = i % 11 === 0;
    const deleted = i % 17 === 0;
    const price = w === 0 ? 60 : w === 1 ? 40 : w === 2 ? (i % 2 ? 65 : 35) : 50;
    return {
      id: fixtureId(owner, "position", i),
      user_id: owner,
      wallet_id: wallets[w].id,
      category_id: categories[i % 4].id,
      instrument: `DEMO-${String(i + 1).padStart(3, "0")}`,
      buy_price: "50",
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
  return { wallets, categories, positions };
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
  if (reset) {
    const references = await all(() =>
      admin.from("positions").select("id,wallet_id,category_id").eq("user_id", owner).order("id"),
    );
    if (
      references.some(
        (p) => !positionIds.includes(p.id) && (walletIds.includes(p.wallet_id) || categoryIds.includes(p.category_id)),
      )
    )
      throw new Error("Reset would affect unrelated positions; no fixtures changed");
    checked(await admin.from("wallet_snapshots").delete().eq("user_id", owner).in("wallet_id", walletIds));
    checked(await admin.from("positions").delete().eq("user_id", owner).in("id", positionIds));
    checked(await admin.from("reason_categories").delete().eq("user_id", owner).in("id", categoryIds));
    checked(await admin.from("wallets").delete().eq("user_id", owner).in("id", walletIds));
  }
  // Duplicate keys are ignored, not updated, so normal reruns preserve manual changes.
  for (const [table, rows] of [
    ["wallets", fixtures.wallets],
    ["reason_categories", fixtures.categories],
    ["positions", fixtures.positions],
  ])
    checked(await admin.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true }));
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
