// Arithmetic tests assume their inputs are intact. These tests use real local Supabase
// to prove numeric(20,8) digits survive saving, updating and reading through our services.
// A missing ::text projection could otherwise lose digits while arithmetic tests still pass.
// Run separately with npm run test:decimal-db; temporary accounts are cleaned up afterward.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { ApiDatabase } from "@/db/api.types";
import {
  closePosition,
  deletePosition,
  restorePosition,
  createPosition,
  getPosition,
  listPositions,
  listConfrontationPositions,
  updatePositionPrice,
} from "@/lib/services/positions";
import { createWallet, getWallet, listWallets, listWalletPositions, updateWallet } from "@/lib/services/wallets";
import { parsePositionForm } from "@/lib/validation/position";
import { parseClosePositionForm } from "@/lib/validation/close-position";
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
let targetId = "";
let position = "";
const max = "999999999999.99999999";
const min = "0.00000001";

// Deterministic provider metadata is a fixture; these transport checks never call Yahoo.
async function selectionFor(walletId: string): Promise<string> {
  const receipt = await author
    .from("market_selection_receipts")
    .insert({ user_id: owner, wallet_id: walletId, target_id: targetId })
    .select("id")
    .single();
  if (receipt.error) throw receipt.error;
  return receipt.data.id;
}

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
    .insert({ currency: "USD", user_id: owner, name: "Decimal proof", starting_value: max })
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
  const target = await author
    .from("market_listing_targets")
    .insert({
      user_id: owner,
      provider: "yahoo",
      symbol: "DECIMAL",
      exchange: "NMS",
      listing_name: "Decimal transport fixture",
      exchange_name: "Nasdaq",
      instrument_type: "EQUITY",
    })
    .select("id")
    .single();
  if (target.error) throw target.error;
  targetId = target.data.id;
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
      market_selection_receipt_id: await selectionFor(wallet),
      buy_date: "2026-01-01",
      opening_commission: "0",
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
    "id,buy_price::text,opening_commission::text,quantity::text,current_price::text,price_date,wallets!positions_wallet_fkey(name),reason_categories(name)";
  const initial = await author.from("positions").select(projection).eq("id", position).single();
  expect(initial.error).toBeNull();
  expect(initial.data).toMatchObject({
    opening_commission: "0.00000000",
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
    market_selection_receipt_id: await selectionFor(wallet),
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
    // Both rows carry the selection's symbol as their label, so order by price instead.
    .order("buy_price", { ascending: false })
    .range(0, 0);
  const second = await author
    .from("positions")
    .select(projection)
    .eq("wallet_id", wallet)
    // Both rows carry the selection's symbol as their label, so order by price instead.
    .order("buy_price", { ascending: false })
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
  const parsedWallet = parseWalletForm({
    currency: "USD",
    name: "Service proof",
    starting_value: "999 999 999 999,99999999",
  });
  if (!parsedWallet.success) throw new Error("Invalid wallet fixture");
  const savedWallet = await createWallet(author, owner, parsedWallet.data);
  expect(savedWallet.ok).toBe(true);
  if (!savedWallet.ok) throw new Error("Wallet save failed");
  const walletId = savedWallet.id;
  expect(await getWallet(author, walletId)).toMatchObject({ starting_value: max });
  expect((await listWallets(author)).find((w) => w.id === walletId)?.starting_value).toBe(max);

  const parsedPosition = parsePositionForm({
    listing_receipt_id: await selectionFor(walletId),
    listing_query: "DECIMAL",
    instrument: "Service proof",
    buy_date: "2026-01-01",
    opening_commission: "0",
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
    opening_commission: "0",
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
  const expected = {
    opening_commission: "0",
    buy_price: "999999999999.99999998",
    current_price: max,
    quantity: min,
    price_date: "2026-10-01",
  };
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
  expect(describeResult(detail)).toEqual({ percent: "0.00%", direction: "up", asOf: "as of Oct 1, 2026" });

  expect(
    await updateWallet(author, walletId, {
      currency: "USD",
      name: "Service proof",
      starting_value: "0",
    }),
  ).toEqual({ ok: true });
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
  expect(
    await updateWallet(foreign, walletId, {
      currency: "USD",
      name: "Forbidden",
      starting_value: max,
    }),
  ).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await getPosition(author, id)).toMatchObject(expected);
  expect(await getWallet(author, walletId)).toMatchObject({ name: "Service proof", starting_value: "0" });
});

it("enforces sale pair, nonnegative and buy-date constraints without changing an open record", async () => {
  const created = await createPosition(author, owner, {
    listing_receipt_id: await selectionFor(wallet),
    instrument: "Sale constraints",
    buy_date: "2026-01-01",
    opening_commission: "0",
    buy_price: "50",
    quantity: "10",
    broker_label: null,
    reason_text: "Keep",
    category_id: category,
    new_category_name: null,
    wallet_id: wallet,
  });
  if (!created.ok) throw new Error("Fixture insert failed");
  const id = created.id;
  expect(await getPosition(author, id)).toMatchObject({
    closing_commission: "0",
    sell_price: null,
    sell_date: null,
    opening_commission: "0",
    buy_price: "50",
    reason_text: "Keep",
  });
  for (const [input, constraint] of [
    [{ closing_commission: "0", sell_price: "60" }, "positions_sale_pair"],
    [{ sell_date: "2026-01-02" }, "positions_sale_pair"],
    [{ closing_commission: "0", sell_price: "-1", sell_date: "2026-01-02" }, "positions_sell_price_nonnegative"],
    [{ closing_commission: "0", sell_price: "60", sell_date: "2025-12-31" }, "positions_sell_date_after_buy"],
  ] as const) {
    const result = await author.from("positions").update(input).eq("id", id);
    expect(result.error?.code).toBe("23514");
    expect(result.error?.message).toContain(constraint);
  }
  expect(await getPosition(author, id)).toMatchObject({
    closing_commission: "0",
    sell_price: null,
    sell_date: null,
    opening_commission: "0",
    buy_price: "50",
    reason_text: "Keep",
  });
  expect(
    await closePosition(foreign, id, { closing_commission: "0", sell_price: "0", sell_date: "2026-01-01" }),
  ).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(
    await closePosition(author, id, { closing_commission: "0", sell_price: "0", sell_date: "2026-01-01" }),
  ).toEqual({ ok: true });
  expect(
    await closePosition(author, id, { closing_commission: "0", sell_price: "60", sell_date: "2026-01-02" }),
  ).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await updatePositionPrice(author, id, { current_price: "100", price_date: "2026-01-03" })).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await getPosition(author, id)).toMatchObject({
    closing_commission: "0",
    sell_price: "0",
    sell_date: "2026-01-01",
    current_price: null,
    opening_commission: "0",
    buy_price: "50",
    reason_text: "Keep",
  });
});

it.each([max, min, "0"])("transports sale %s through every position service without rounding", async (sellPrice) => {
  const created = await createPosition(author, owner, {
    listing_receipt_id: await selectionFor(wallet),
    instrument: `Sale ${sellPrice}`,
    buy_date: "2026-01-01",
    opening_commission: "0",
    buy_price: "50",
    quantity: null,
    broker_label: null,
    reason_text: null,
    category_id: category,
    new_category_name: null,
    wallet_id: wallet,
  });
  if (!created.ok) throw new Error("Fixture insert failed");
  const parsed = parseClosePositionForm(
    {
      closing_commission: "0",
      sell_price: sellPrice.replace(".", ","),
      sell_date: "2026-01-01",
      quantity: "",
      acknowledgement: "on",
    },
    "2026-01-01",
  );
  if (!parsed.success) throw new Error("Invalid close fixture");
  expect(await closePosition(author, created.id, parsed.data)).toEqual({ ok: true });
  const expected = { closing_commission: "0", sell_price: sellPrice, sell_date: "2026-01-01", current_price: null };
  expect(await getPosition(author, created.id)).toMatchObject(expected);
  expect((await listPositions(author)).find((row) => row.id === created.id)).toMatchObject(expected);
  expect((await listPositions(author, wallet)).find((row) => row.id === created.id)).toMatchObject(expected);
  expect((await listConfrontationPositions(author)).find((row) => row.id === created.id)).toMatchObject(expected);
  expect(await listWalletPositions(author)).toEqual(
    expect.arrayContaining([expect.objectContaining({ ...expected, wallet_id: wallet })]),
  );
  expect(await getPosition(foreign, created.id)).toBeNull();
});

it("allows exactly one competing complete sale and preserves the winning facts", async () => {
  const created = await createPosition(author, owner, {
    listing_receipt_id: await selectionFor(wallet),
    instrument: "Competing sale",
    buy_date: "2026-01-01",
    opening_commission: "0",
    buy_price: "50",
    quantity: "10",
    broker_label: "Keep broker",
    reason_text: "Keep reason",
    category_id: category,
    new_category_name: null,
    wallet_id: wallet,
  });
  if (!created.ok) throw new Error("Fixture insert failed");
  const id = created.id;
  expect(await updatePositionPrice(author, id, { current_price: "80", price_date: "2026-10-01" })).toEqual({
    ok: true,
  });
  const submissions = [
    { closing_commission: "0", sell_price: "60.00000001", sell_date: "2026-02-01" },
    { closing_commission: "0", sell_price: "0", sell_date: "2026-03-01" },
  ];
  const results = await Promise.all(submissions.map((input) => closePosition(author, id, input)));
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "not_found" }]);
  const winner = submissions[results.findIndex((result) => result.ok)];
  const saved = await getPosition(author, id);
  expect(saved).toMatchObject({
    ...winner,
    opening_commission: "0",
    buy_price: "50",
    quantity: "10",
    current_price: "80",
    price_date: "2026-10-01",
    broker_label: "Keep broker",
    reason_text: "Keep reason",
    wallet_id: wallet,
  });
  expect(await updatePositionPrice(author, id, { current_price: "999", price_date: "2026-10-02" })).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(
    await closePosition(author, id, { closing_commission: "0", sell_price: "100", sell_date: "2026-04-01" }),
  ).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await getPosition(author, id)).toEqual(saved);
  expect(await getPosition(foreign, id)).toBeNull();
  expect(await closePosition(foreign, id, submissions[0])).toEqual({ ok: false, error: "not_found" });
  expect(await updatePositionPrice(foreign, id, { current_price: "1", price_date: "2026-10-02" })).toEqual({
    ok: false,
    error: "not_found",
  });
});

it("keeps missing, deleted and foreign ids indistinguishable for reads and guarded writes", async () => {
  const created = await createPosition(author, owner, {
    listing_receipt_id: await selectionFor(wallet),
    instrument: "Unavailable sale",
    buy_date: "2026-01-01",
    opening_commission: "0",
    buy_price: "50",
    quantity: "10",
    broker_label: null,
    reason_text: null,
    category_id: category,
    new_category_name: null,
    wallet_id: wallet,
  });
  if (!created.ok) throw new Error("Fixture insert failed");
  const id = created.id;
  const before = await getPosition(author, id);
  for (const [client, unavailableId] of [
    [foreign, id],
    [author, randomUUID()],
  ] as const) {
    expect(await getPosition(client, unavailableId)).toBeNull();
    expect(
      await closePosition(client, unavailableId, {
        closing_commission: "0",
        sell_price: "60",
        sell_date: "2026-02-01",
      }),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await updatePositionPrice(client, unavailableId, { current_price: "60", price_date: "2026-02-01" })).toEqual(
      { ok: false, error: "not_found" },
    );
  }
  expect(await getPosition(author, id)).toEqual(before);
  expect(await deletePosition(author, id)).toEqual({ ok: true });
  expect(await getPosition(author, id)).toBeNull();
  expect(
    await closePosition(author, id, { closing_commission: "0", sell_price: "60", sell_date: "2026-02-01" }),
  ).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await updatePositionPrice(author, id, { current_price: "60", price_date: "2026-02-01" })).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await restorePosition(author, id)).toEqual({ ok: true });
  expect(await getPosition(author, id)).toEqual(before);
});

it("restores every sale fact and the realised wallet contribution after deletion", async () => {
  const savedWallet = await createWallet(author, owner, {
    currency: "USD",
    name: "Realised restoration",
    starting_value: "1000",
  });
  if (!savedWallet.ok) throw new Error("Fixture wallet failed");
  const walletId = savedWallet.id;
  const create = async (instrument: string, buy_price: string, quantity: string) =>
    createPosition(author, owner, {
      listing_receipt_id: await selectionFor(walletId),
      instrument,
      opening_commission: "0",
      buy_price,
      quantity,
      buy_date: "2026-01-01",
      broker_label: "Broker",
      reason_text: "Original reasoning",
      category_id: category,
      new_category_name: null,
      wallet_id: walletId,
    });
  const closed = await create("Realised", "50", "10");
  const open = await create("Open", "10", "20");
  if (!closed.ok || !open.ok) throw new Error("Fixture position failed");
  expect(
    await closePosition(author, closed.id, { closing_commission: "0", sell_price: "60", sell_date: "2026-02-01" }),
  ).toEqual({ ok: true });
  expect(await updatePositionPrice(author, open.id, { current_price: "12", price_date: "2026-10-01" })).toEqual({
    ok: true,
  });
  const sale = await getPosition(author, closed.id);
  const value = async () => walletValue({ starting_value: "1000" }, await listPositions(author, walletId));
  expect(formatAmount((await value()).value)).toBe("1,140.00");
  expect(await value()).toMatchObject({ counted: 2, realisedCount: 1, openCount: 1, asOf: "2026-10-01" });
  expect(await deletePosition(author, closed.id)).toEqual({ ok: true });
  expect(formatAmount((await value()).value)).toBe("1,040.00");
  expect((await listConfrontationPositions(author)).some((row) => row.id === closed.id)).toBe(false);
  expect(await restorePosition(author, closed.id)).toEqual({ ok: true });
  expect(await getPosition(author, closed.id)).toEqual(sale);
  expect(formatAmount((await value()).value)).toBe("1,140.00");
  expect((await listConfrontationPositions(author)).find((row) => row.id === closed.id)).toMatchObject({
    closing_commission: "0",
    sell_price: "60",
    sell_date: "2026-02-01",
  });
});
