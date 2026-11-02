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
function client(code: string, data: unknown = null) {
  return createClient<ApiDatabase>("http://localhost:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify(code ? { code, message: "private", details: "private row" } : data), {
            status: code ? 400 : 200,
            headers: { "content-type": "application/json" },
          }),
        ),
    },
  });
}
const input = {
  category_id: "category",
  new_category_name: null,
  instrument: "Private",
  buy_date: "2026-01-01",
  buy_price: "1",
  quantity: null,
  broker_label: null,
  reason_text: "private",
  wallet_id: "wallet",
  listing_receipt_id: "receipt",
};
const writes = [
  { operation: "createPosition", run: (c: ReturnType<typeof client>) => createPosition(c, "user", input) },
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
    run: (c: ReturnType<typeof client>) => closePosition(c, "id", { sell_price: "0", sell_date: "2026-01-02" }),
  },
];
it.each(writes)("$operation reports unexpected returned errors once", async ({ operation, run }) => {
  expect(await run(client("XX000"))).toEqual({ ok: false, error: "unexpected" });
  expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "XX000" }), { operation });
});
it.each([writes[0], writes[1], writes[4], writes[5], writes[6]])(
  "$operation keeps validation quiet",
  async ({ run }) => {
    expect(await run(client("23514"))).toEqual({ ok: false, error: "validation" });
    expect(reportUnexpected).not.toHaveBeenCalled();
  },
);
it.each([writes[2], writes[3], writes[5], writes[6]])("$operation keeps missing rows quiet", async ({ run }) => {
  expect(await run(client("", []))).toEqual({ ok: false, error: "not_found" });
  expect(reportUnexpected).not.toHaveBeenCalled();
});
it.each([writes[4], writes[5]])("$operation keeps name conflicts quiet", async ({ run }) => {
  expect(await run(client("23505"))).toEqual({ ok: false, error: "name_taken" });
  expect(reportUnexpected).not.toHaveBeenCalled();
});
