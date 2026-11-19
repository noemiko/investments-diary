import type { ApiDatabase } from "@/db/api.types";
import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import {
  closePosition,
  createPosition,
  updatePositionPrice,
  deletePosition,
  restorePosition,
} from "@/lib/services/positions";
import { createWallet, updateWallet } from "@/lib/services/wallets";
import { reportUnexpected } from "@/lib/observability/reporter";
vi.mock("@/lib/services/market-selections", () => ({
  readMarketSelection: vi.fn(() => Promise.resolve({ receiptId: "receipt", targetId: "target", symbol: "AAPL" })),
}));
vi.mock("@/lib/observability/reporter", async (original) => ({
  ...(await original<object>()),
  reportUnexpected: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
function databaseResponse(code: string, data: unknown = null, message = "private") {
  return new Response(JSON.stringify(code ? { code, message, details: "private row" } : data), {
    status: code ? 400 : 200,
    headers: { "content-type": "application/json" },
  });
}
function client(code: string, data: unknown = null, message?: string) {
  return clientWithFetch(() => Promise.resolve(databaseResponse(code, data, message)));
}
function clientWithFetch(fetch: typeof globalThis.fetch) {
  return createClient<ApiDatabase>("http://localhost:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
}
const input = {
  category_id: "category",
  new_category_name: null,
  instrument: "Private",
  buy_date: "2026-01-01",
  opening_commission: "0",
  buy_price: "1",
  quantity: null,
  broker_label: null,
  reason_text: "private",
  wallet_id: "wallet",
  listing_receipt_id: "receipt",
};
const writes = [
  {
    operation: "updatePositionPrice",
    run: (c: ReturnType<typeof client>) =>
      updatePositionPrice(c, "id", { current_price: "2", price_date: "2026-01-02" }),
  },
  { operation: "deletePosition", run: (c: ReturnType<typeof client>) => deletePosition(c, "id") },
  { operation: "restorePosition", run: (c: ReturnType<typeof client>) => restorePosition(c, "id") },
  {
    operation: "createWallet",
    run: (c: ReturnType<typeof client>) =>
      createWallet(c, "user", { name: "private", starting_value: "0", currency: "USD" }),
  },
  {
    operation: "updateWallet",
    run: (c: ReturnType<typeof client>) =>
      updateWallet(c, "id", { name: "private", starting_value: "0", currency: "USD" }),
  },
  {
    operation: "closePosition",
    run: (c: ReturnType<typeof client>) =>
      closePosition(c, "id", { closing_commission: "0", sell_price: "0", sell_date: "2026-01-02" }),
  },
];
it.each(writes)("$operation reports unexpected returned errors once", async ({ operation, run }) => {
  expect(await run(client("XX000"))).toEqual({ ok: false, error: "unexpected" });
  expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "XX000" }), { operation });
});
it.each([writes[0], writes[3], writes[4], writes[5]])("$operation keeps validation quiet", async ({ run }) => {
  expect(await run(client("23514"))).toEqual({ ok: false, error: "validation" });
  expect(reportUnexpected).not.toHaveBeenCalled();
});
it.each([writes[1], writes[2], writes[4], writes[5]])("$operation keeps missing rows quiet", async ({ run }) => {
  expect(await run(client("", []))).toEqual({ ok: false, error: "not_found" });
  expect(reportUnexpected).not.toHaveBeenCalled();
});
it.each([writes[3], writes[4]])("$operation keeps name conflicts quiet", async ({ run }) => {
  expect(await run(client("23505"))).toEqual({ ok: false, error: "name_taken" });
  expect(reportUnexpected).not.toHaveBeenCalled();
});

const receiptRejection = "Choose a valid stock selection for this wallet";
const foreignKeyMessage = (constraint: string) =>
  `insert or update on table "positions" violates foreign key constraint "${constraint}"`;

it("keeps an exact receipt rejection quiet when the pre-read had succeeded", async () => {
  const result = await createPosition(client("23514", null, receiptRejection), "user", input);
  expect(result).toEqual({ ok: false, error: "selection_invalid" });
  expect(reportUnexpected).not.toHaveBeenCalled();
});

it.each([
  ["positions_wallet_fkey", "wallet_not_found"],
  ["positions_category_id_user_id_fkey", "category_not_found"],
])("keeps the exact %s foreign key rejection quiet", async (constraint, outcome) => {
  const result = await createPosition(client("23503", null, foreignKeyMessage(constraint)), "user", input);
  expect(result).toEqual({ ok: false, error: outcome });
  expect(reportUnexpected).not.toHaveBeenCalled();
});

it.each([
  ["23514", "private", "constraint_rejection"],
  ["XX000", receiptRejection, "database_error"],
  ["23503", foreignKeyMessage("positions_wallet_fkey_extra"), "constraint_rejection"],
  ["22003", "private", "constraint_rejection"],
])("reports unmapped position rejections with code %s once", async (code, message, category) => {
  const result = await createPosition(client(code, null, message), "user", input);
  expect(result).toEqual({ ok: false, error: "unexpected" });
  expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code }), {
    operation: "createPosition",
    investmentSave: { stage: "position_insert", category },
  });
  const error = vi.mocked(reportUnexpected).mock.calls[0][0];
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toHaveProperty("message", message);
  expect(error).not.toHaveProperty("details");
  expect(error).not.toHaveProperty("cause", expect.anything());
});

it("reports a category insert failure even if it matches the receipt signature", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(databaseResponse("", []))
    .mockResolvedValueOnce(databaseResponse("23514", null, receiptRejection));
  const result = await createPosition(clientWithFetch(fetch), "user", {
    ...input,
    category_id: null,
    new_category_name: "Private",
  });
  expect(result).toEqual({ ok: false, error: "unexpected" });
  expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "23514" }), {
    operation: "createPosition",
    investmentSave: { stage: "category_insert", category: "constraint_rejection" },
  });
});

it.each([false, true])("saves after ordinary or raced category creation (raced=%s)", async (raced) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(databaseResponse("", []));
  if (raced) {
    fetch
      .mockResolvedValueOnce(databaseResponse("23505"))
      .mockResolvedValueOnce(databaseResponse("", [{ id: "category", name: "private" }]));
  } else {
    fetch.mockResolvedValueOnce(databaseResponse("", { id: "category" }));
  }
  fetch.mockResolvedValueOnce(databaseResponse("", { id: "position" }));
  const result = await createPosition(clientWithFetch(fetch), "user", {
    ...input,
    category_id: null,
    new_category_name: "Private",
  });
  expect(result).toEqual({ ok: true, id: "position" });
  expect(reportUnexpected).not.toHaveBeenCalled();
});
