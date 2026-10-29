import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { ApiDatabase } from "@/db/api.types";
import { listWalletSnapshots } from "@/lib/services/wallet-snapshots";
import { aggregateUnits } from "@/lib/wallet-history";
it("reads exact signed aggregates through real PostgREST with pagination and owner isolation", async () => {
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
      const email = `snapshot-${randomUUID()}@example.test`,
        password = randomUUID();
      const r = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (r.error) throw r.error;
      owners.push(r.data.user.id);
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    }
    const w = await author
      .from("wallets")
      .insert({ user_id: owners[0], name: "Snapshot proof", starting_value: "0" })
      .select("id")
      .single();
    if (w.error) throw w.error;
    const rows = Array.from({ length: 1002 }, (_, i) => {
      const day = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
      return {
        wallet_id: w.data.id,
        user_id: owners[0],
        observation_day: day,
        captured_at: `${day}T00:00:00Z`,
        starting_value: "0",
        value: "-1000000000000000000000000.0000000000000001",
        realised_change: "-1000000000000000000000000.0000000000000001",
        open_change: "0",
        realised_count: 1,
        open_count: 0,
        not_counted: 0,
      };
    });
    expect((await admin.from("wallet_snapshots").insert(rows)).error).toBeNull();
    const read = await listWalletSnapshots(author, w.data.id);
    expect(read).toHaveLength(1002);
    expect(aggregateUnits(read[1001].value)).toBe(-10000000000000000000000000000000000000001n);
    expect(await listWalletSnapshots(foreign, w.data.id)).toEqual([]);
    expect((await author.rpc("capture_wallet_snapshots")).error).not.toBeNull();
    expect(
      (await author.from("wallet_snapshots").update({ value: "0" }).eq("wallet_id", w.data.id)).error,
    ).not.toBeNull();
  } finally {
    for (const owner of owners) expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});
