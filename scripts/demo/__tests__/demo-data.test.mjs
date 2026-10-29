import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertLocal, demoFixtures, demoSnapshots, seedDemo } from "../lib/demo-data.mjs";
test("nonlocal origins rejected and synthetic latest totals agree with fixture arithmetic", () => {
  for (const url of ["https://localhost", "https://example.com", "http://127.0.0.1.evil.test"])
    assert.throws(() => assertLocal(url));
  const f = demoFixtures("fixture", "2026-10-28");
  assert.equal(f.positions.length, 100);
  assert.equal(f.wallets.length, 5);
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
    assert.equal(ok(await admin.from("positions").select("id").eq("user_id", owner)).length, 100);
    ok(await admin.from("positions").update({ instrument: "MANUAL EDIT" }).eq("id", f.positions[0].id));
    ok(
      await admin
        .from("wallet_snapshots")
        .delete()
        .eq("wallet_id", f.wallets[0].id)
        .eq("observation_day", "2026-10-28"),
    );
    await seedDemo(admin, password, { email, today: "2026-10-29" });
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
    await seedDemo(admin, password, { email, reset: true, today: "2026-10-29" });
    assert.equal(
      ok(await admin.from("positions").select("instrument").eq("id", f.positions[0].id).single()).instrument,
      "DEMO-001",
    );
    const extra = { ...f.positions[1], id: randomUUID(), instrument: "Unrelated manually added" };
    ok(await admin.from("positions").insert(extra));
    await assert.rejects(seedDemo(admin, password, { email, reset: true }), /unrelated/);
    assert.equal(ok(await admin.from("positions").select("id").eq("id", extra.id)).length, 1);
    // Existing unmarked account must never be adopted or modified.
    ok(await admin.auth.admin.updateUserById(owner, { app_metadata: { demo_seed: null } }));
    await assert.rejects(seedDemo(admin, password, { email }), /unmarked/);
  } finally {
    if (owner) ok(await admin.auth.admin.deleteUser(owner));
  }
});
