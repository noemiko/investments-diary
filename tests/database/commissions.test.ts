import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import {
  createPosition,
  closePosition,
  getPosition,
  listPositions,
  listConfrontationPositions,
  updatePositionPrice,
  deletePosition,
  restorePosition,
} from "@/lib/services/positions";
import { listWalletPositions } from "@/lib/services/wallets";
import { walletValue } from "@/lib/wallet";
import { aggregateUnits } from "@/lib/wallet-history";
import { describeResult } from "@/lib/result";
import { selectionReceipt } from "./selection-fixture";

it("persists exact commissions, guards atomic legacy closes and matches live totals to future observations", async () => {
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
      const email = `commission-${randomUUID()}@example.test`,
        password = randomUUID();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      owners.push(created.data.user.id);
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    }
    const owner = owners[0];
    const wallet = await author
      .from("wallets")
      .insert({ user_id: owner, name: "Commissions", currency: "USD", starting_value: "1000" })
      .select("id")
      .single();
    const category = await author
      .from("reason_categories")
      .insert({ user_id: owner, name: "Commissions" })
      .select("id")
      .single();
    if (wallet.error) throw wallet.error;
    if (category.error) throw category.error;
    const walletId = wallet.data.id;
    const receipt = await selectionReceipt(author, owner, walletId, "FEES");
    const base = {
      user_id: owner,
      wallet_id: walletId,
      category_id: category.data.id,
      market_selection_receipt_id: receipt,
      instrument: "FEES",
      buy_price: "100",
      buy_date: "2026-01-01",
    };
    const raw = await author
      .from("positions")
      .insert({ ...base, quantity: null })
      .select("id,opening_commission::text,closing_commission::text")
      .single();
    if (raw.error) throw raw.error;
    expect(raw.data).toMatchObject({ opening_commission: "0.00000000", closing_commission: "0.00000000" });
    const legacyId = raw.data.id;
    for (const invalid of [
      { opening_commission: "-1", quantity: "1" },
      { opening_commission: "1", quantity: null },
      { closing_commission: "1", quantity: "1" },
    ])
      expect((await author.from("positions").insert({ ...base, ...invalid })).error?.code).toBe("23514");

    const created = await createPosition(author, owner, {
      instrument: "FEES",
      listing_receipt_id: receipt,
      wallet_id: walletId,
      category_id: category.data.id,
      new_category_name: null,
      buy_price: "100",
      buy_date: "2026-01-01",
      opening_commission: "5.00000001",
      quantity: "10",
      broker_label: null,
      reason_text: null,
    });
    if (!created.ok) throw new Error("Commission position failed");
    const id = created.id;
    const detail = await getPosition(author, id);
    expect(detail).toMatchObject({ opening_commission: "5.00000001", closing_commission: "0", current_price: null });
    for (const rows of [
      await listPositions(author),
      await listConfrontationPositions(author),
      await listWalletPositions(author),
    ]) {
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ opening_commission: "5.00000001", closing_commission: "0" }),
        ]),
      );
    }
    const live = async () => walletValue({ starting_value: "1000" }, await listPositions(author, walletId));
    expect((await live()).value.units).toBe(9949999999900000000n);
    expect(await live()).toMatchObject({ counted: 0, notCounted: 2, openCount: 0, asOf: null });

    const capture = async () => {
      expect((await admin.rpc("capture_wallet_snapshots")).error).toBeNull();
      const observation = await author
        .from("wallet_snapshots")
        .select(
          "value::text,open_change::text,realised_change::text,open_count,realised_count,not_counted,as_of,automatic_count,manual_count",
        )
        .eq("wallet_id", walletId)
        .single();
      if (observation.error) throw observation.error;
      return observation.data;
    };
    const initial = await capture();
    expect(aggregateUnits(initial.value)).toBe((await live()).value.units);
    expect(initial).toMatchObject({
      open_count: 0,
      realised_count: 0,
      not_counted: 2,
      as_of: null,
      automatic_count: 0,
      manual_count: 0,
    });

    expect(await updatePositionPrice(author, id, { current_price: "110", price_date: "2026-01-02" })).toEqual({
      ok: true,
    });
    expect(
      await closePosition(author, id, {
        sell_price: "110",
        sell_date: "2026-01-03",
        closing_commission: "7",
        quantity: "999",
      }),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await getPosition(author, id)).toMatchObject({ quantity: "10", sell_price: null, closing_commission: "0" });
    // Quote arrival replaces the fee-only contribution, without counting legacy missing quantity.
    expect((await admin.from("wallet_snapshots").delete().eq("wallet_id", walletId)).error).toBeNull();
    const priced = await capture();
    expect(aggregateUnits(priced.value)).toBe((await live()).value.units);
    expect(aggregateUnits(priced.open_change)).toBe(949999999900000000n);
    expect(priced).toMatchObject({
      open_count: 1,
      realised_count: 0,
      not_counted: 1,
      manual_count: 1,
      automatic_count: 0,
      as_of: "2026-01-02",
    });
    expect(
      await closePosition(author, id, { sell_price: "110", sell_date: "2026-01-03", closing_commission: "7" }),
    ).toEqual({ ok: true });
    const closedPosition = await getPosition(author, id);
    if (!closedPosition) throw new Error("Missing closed position");
    expect(describeResult(closedPosition)?.percent).toBe("Final +8.76%");
    expect(
      await closePosition(foreign, legacyId, {
        sell_price: "110",
        sell_date: "2026-01-03",
        closing_commission: "1",
        quantity: "2",
      }),
    ).toEqual({ ok: false, error: "not_found" });
    expect(
      await closePosition(author, legacyId, {
        sell_price: "110",
        sell_date: "2025-12-31",
        closing_commission: "1",
        quantity: "2",
      }),
    ).toEqual({ ok: false, error: "validation" });
    expect(await getPosition(author, legacyId)).toMatchObject({
      quantity: null,
      sell_price: null,
      closing_commission: "0",
    });
    const submissions = [
      { sell_price: "110", sell_date: "2026-01-03", closing_commission: "3.00000001", quantity: "2" },
      { sell_price: "120", sell_date: "2026-01-04", closing_commission: "4.00000001", quantity: "3" },
    ];
    const closes = await Promise.all(submissions.map((input) => closePosition(author, legacyId, input)));
    expect(closes.filter((result) => result.ok)).toHaveLength(1);
    expect(closes.filter((result) => !result.ok)).toEqual([{ ok: false, error: "not_found" }]);
    const winner = submissions[closes.findIndex((result) => result.ok)];
    expect(await getPosition(author, legacyId)).toMatchObject(winner);
    const saved = await getPosition(author, id);
    expect(await closePosition(author, id, { ...submissions[0], quantity: "999" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await getPosition(author, id)).toEqual(saved);
    expect(await getPosition(foreign, id)).toBeNull();
    expect(
      (await foreign.from("positions").update({ opening_commission: "999" }).eq("id", id).select("id")).data,
    ).toEqual([]);
    expect(await getPosition(author, id)).toEqual(saved);

    // A later capture must not recalculate an observation already recorded today.
    expect(await capture()).toEqual(priced);
    // Only remove this disposable test wallet's observation to exercise a fresh capture.
    expect((await admin.from("wallet_snapshots").delete().eq("wallet_id", walletId)).error).toBeNull();
    const final = await capture();
    expect(aggregateUnits(final.value)).toBe((await live()).value.units);
    expect(aggregateUnits(final.realised_change)).toBe((await live()).realisedChange.units);
    expect(final).toMatchObject({ realised_count: 2, open_count: 0, not_counted: 0, as_of: null });
    const beforeDelete = (await live()).value.units;
    expect(await deletePosition(author, id)).toEqual({ ok: true });
    expect((await live()).value.units).toBeLessThan(beforeDelete);
    expect(await restorePosition(author, id)).toEqual({ ok: true });
    expect((await live()).value.units).toBe(beforeDelete);
    expect(await getPosition(author, id)).toEqual(saved);
  } finally {
    for (const owner of owners) expect((await admin.auth.admin.deleteUser(owner)).error).toBeNull();
  }
});
