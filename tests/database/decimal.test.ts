// Arithmetic tests assume their inputs are intact. These tests use real local Supabase
// to prove numeric(20,8) digits survive saving, updating and reading through our services.
// A missing ::text projection could otherwise lose digits while arithmetic tests still pass.
// Run separately with npm run test:decimal-db; temporary accounts are cleaned up afterward.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { ApiDatabase } from "@/db/api.types";
import {
  createPosition,
  getPosition,
  listPositions,
  listConfrontationPositions,
  updatePositionPrice,
} from "@/lib/services/positions";
import { createWallet, getWallet, listWallets, listWalletPositions, updateWallet } from "@/lib/services/wallets";
import { parsePositionForm } from "@/lib/validation/position";
import { parsePriceForm } from "@/lib/validation/price";
import { parseWalletForm } from "@/lib/validation/wallet";
import { positionResult, describeResult } from "@/lib/result";
import { walletValue } from "@/lib/wallet";
import { formatAmount } from "@/lib/format";

const url = new URL(process.env.SUPABASE_TEST_URL ?? "http://invalid");
if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
  throw new Error("Database test URL must be local");
}
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_KEY;
if (!anon || !service) throw new Error("Run npm run test:decimal-db to supply local credentials");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<ApiDatabase>(url.origin, service, options);
const author = createClient<ApiDatabase>(url.origin, anon, options);
const foreign = createClient<ApiDatabase>(url.origin, anon, options);
const users: string[] = [];
let owner = "";
let wallet = "";
let category = "";
let position = "";
const max = "999999999999.99999999";
const min = "0.00000001";

beforeAll(async () => {
  for (const client of [author, foreign]) {
    const email = `decimal-${randomUUID()}@example.test`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
  }
  owner = users[0];
  const w = await author
    .from("wallets")
    .insert({ user_id: owner, name: "Decimal proof", starting_value: max })
    .select("id")
    .single();
  if (w.error) throw w.error;
  wallet = w.data.id;
  const c = await author
    .from("reason_categories")
    .insert({ user_id: owner, name: "Decimal proof" })
    .select("id")
    .single();
  if (c.error) throw c.error;
  category = c.data.id;
});

afterAll(async () => {
  // Keep every created id immediately, so partial setup failures are cleaned up too.
  const failures = [];
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) failures.push(result.error.message);
  }
  if (failures.length) throw new Error(`Test account cleanup failed: ${failures.join(", ")}`);
});

it("round-trips the full numeric range, nullable values, joins and pagination without losing a digit", async () => {
  const created = await author
    .from("positions")
    .insert({
      user_id: owner,
      instrument: "Exact",
      buy_date: "2026-01-01",
      buy_price: "999999999999.99999998",
      quantity: max,
      category_id: category,
      wallet_id: wallet,
    })
    .select("id")
    .single();
  expect(created.error).toBeNull();
  if (!created.data) throw new Error("Missing position");
  position = created.data.id;
  const projection =
    "id,buy_price::text,quantity::text,current_price::text,price_date,wallets!positions_wallet_fkey(name),reason_categories(name)";
  const initial = await author.from("positions").select(projection).eq("id", position).single();
  expect(initial.error).toBeNull();
  expect(initial.data).toMatchObject({
    buy_price: "999999999999.99999998",
    quantity: max,
    current_price: null,
    price_date: null,
    wallets: { name: "Decimal proof" },
    reason_categories: { name: "Decimal proof" },
  });
  const updated = await author
    .from("positions")
    .update({ current_price: max, price_date: "2026-10-01" })
    .eq("id", position);
  expect(updated.error).toBeNull();
  expect(
    (await author.from("positions").select("current_price::text").eq("id", position).single()).data?.current_price,
  ).toBe(max);
  expect(
    (await author.from("wallets").select("starting_value::text").eq("id", wallet).single()).data?.starting_value,
  ).toBe(max);
  const low = await author.from("positions").insert({
    user_id: owner,
    instrument: "Minimum",
    buy_date: "2026-01-01",
    buy_price: min,
    quantity: null,
    category_id: category,
    wallet_id: wallet,
  });
  expect(low.error).toBeNull();
  const first = await author
    .from("positions")
    .select(projection)
    .eq("wallet_id", wallet)
    .order("instrument")
    .range(0, 0);
  const second = await author
    .from("positions")
    .select(projection)
    .eq("wallet_id", wallet)
    .order("instrument")
    .range(1, 1);
  expect(first.error).toBeNull();
  expect(second.error).toBeNull();
  expect(first.data).toHaveLength(1);
  expect(second.data).toHaveLength(1);
  expect(second.data?.[0]).toMatchObject({ buy_price: min, quantity: null, current_price: null });
  expect(first.data?.[0].id).not.toBe(second.data?.[0].id);
  expect((await author.from("wallets").update({ starting_value: min }).eq("id", wallet)).error).toBeNull();
  expect(
    (await author.from("wallets").select("starting_value::text").eq("id", wallet).single()).data?.starting_value,
  ).toBe(min);
});

it("does not expose or update another account's exact decimals", async () => {
  expect(position).not.toBe("");
  const read = await foreign.from("positions").select("buy_price::text,current_price::text").eq("id", position);
  expect(read.error).toBeNull();
  expect(read.data).toEqual([]);
  const write = await foreign
    .from("positions")
    .update({ current_price: min, price_date: "2026-10-02" })
    .eq("id", position)
    .select("id");
  expect(write.error).toBeNull();
  expect(write.data).toEqual([]);
  const walletRead = await foreign.from("wallets").select("starting_value::text").eq("id", wallet);
  expect(walletRead.error).toBeNull();
  expect(walletRead.data).toEqual([]);
  const walletWrite = await foreign.from("wallets").update({ starting_value: "0" }).eq("id", wallet).select("id");
  expect(walletWrite.error).toBeNull();
  expect(walletWrite.data).toEqual([]);
  expect(
    (await author.from("positions").select("current_price::text").eq("id", position).single()).data?.current_price,
  ).toBe(max);
  expect(
    (await author.from("wallets").select("starting_value::text").eq("id", wallet).single()).data?.starting_value,
  ).toBe(min);
});

it("preserves form digits through every production service and exact arithmetic", async () => {
  const parsedWallet = parseWalletForm({ name: "Service proof", starting_value: "999 999 999 999,99999999" });
  if (!parsedWallet.success) throw new Error("Invalid wallet fixture");
  const savedWallet = await createWallet(author, owner, parsedWallet.data);
  expect(savedWallet.ok).toBe(true);
  if (!savedWallet.ok) throw new Error("Wallet save failed");
  const walletId = savedWallet.id;
  expect(await getWallet(author, walletId)).toMatchObject({ starting_value: max });
  expect((await listWallets(author)).find((w) => w.id === walletId)?.starting_value).toBe(max);

  const parsedPosition = parsePositionForm({
    instrument: "Service proof",
    buy_date: "2026-01-01",
    buy_price: "999999999999,99999998",
    quantity: "0,00000001",
    wallet_id: walletId,
    category_id: category,
    new_category_name: "",
    reason_text: "Keep these digits",
    broker_label: "Exact broker",
  });
  if (!parsedPosition.success) throw new Error("Invalid position fixture");
  const savedPosition = await createPosition(author, owner, parsedPosition.data);
  expect(savedPosition.ok).toBe(true);
  if (!savedPosition.ok) throw new Error("Position save failed");
  const id = savedPosition.id;
  expect(await getPosition(author, id)).toMatchObject({
    buy_price: "999999999999.99999998",
    quantity: min,
    current_price: null,
    price_date: null,
    wallet_name: "Service proof",
    category_name: "Decimal proof",
  });

  const parsedPrice = parsePriceForm(
    { current_price: "999999999999,99999999", price_date: "2026-10-01" },
    "2026-01-01",
  );
  if (!parsedPrice.success) throw new Error("Invalid price fixture");
  expect(await updatePositionPrice(author, id, parsedPrice.data)).toEqual({ ok: true });
  const detail = await getPosition(author, id);
  if (!detail) throw new Error("Missing service position");
  const expected = { buy_price: "999999999999.99999998", current_price: max, quantity: min, price_date: "2026-10-01" };
  expect(detail).toMatchObject(expected);
  expect(detail).toMatchObject({
    reason_text: "Keep these digits",
    broker_label: "Exact broker",
    buy_date: "2026-01-01",
  });
  expect((await listPositions(author, walletId))[0]).toMatchObject(expected);
  expect((await listPositions(author)).find((p) => p.id === id)).toMatchObject(expected);
  expect((await listConfrontationPositions(author)).find((p) => p.id === id)).toMatchObject(expected);
  expect((await listWalletPositions(author)).find((p) => p.wallet_id === walletId)).toMatchObject(expected);
  expect(positionResult(detail)?.amount).toEqual({ units: 1n, scale: 16 });
  expect(describeResult(detail)).toEqual({ percent: "0.00%", asOf: "as of Oct 1, 2026" });

  expect(await updateWallet(author, walletId, { name: "Service proof", starting_value: "0" })).toEqual({ ok: true });
  expect(await getWallet(author, walletId)).toMatchObject({ starting_value: "0" });
  const result = walletValue({ starting_value: "0" }, await listPositions(author, walletId));
  expect(result.change).toEqual({ units: 1n, scale: 16 });
  expect(result.changePercent).toBeNull();
  expect(formatAmount(result.value)).toBe("0.00");

  expect(await getPosition(foreign, id)).toBeNull();
  expect(await getWallet(foreign, walletId)).toBeNull();
  expect(await listPositions(foreign, walletId)).toEqual([]);
  expect(await listConfrontationPositions(foreign)).toEqual([]);
  expect(await listWalletPositions(foreign)).toEqual([]);
  expect(await listWallets(foreign)).toEqual([]);
  expect(await updatePositionPrice(foreign, id, { current_price: min, price_date: "2026-10-02" })).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await updateWallet(foreign, walletId, { name: "Forbidden", starting_value: max })).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await getPosition(author, id)).toMatchObject(expected);
  expect(await getWallet(author, walletId)).toMatchObject({ name: "Service proof", starting_value: "0" });
});
