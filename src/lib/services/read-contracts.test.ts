import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import { getPosition, listConfrontationPositions, listPositions } from "@/lib/services/positions";
import { getWallet, listWalletPositions, listWallets } from "@/lib/services/wallets";

interface QueryContract {
  table: string;
  columns: string[];
  id?: string;
  walletId?: string;
  order?: string;
}

// Real PostgREST serialization, with only the network replaced. This checks the
// author's active-record view and transport shape; it does not claim to test RLS.
function transport(contract: QueryContract, rows: unknown[], fail = false) {
  return createClient<ApiDatabase>("http://localhost:54321", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    // Transport fixtures must surface failures immediately, without retry backoff.
    db: { retry: false },
    global: {
      fetch: (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.pathname).toBe(`/rest/v1/${contract.table}`);
        const params = url.searchParams;
        const selected = params.get("select")?.split(",") ?? [];
        for (const column of contract.columns) expect(selected).toContain(column);
        expect(params.get("deleted_at")).toBe("is.null");
        expect(params.get("id")).toBe(contract.id === undefined ? null : `eq.${contract.id}`);
        expect(params.get("wallet_id")).toBe(contract.walletId === undefined ? null : `eq.${contract.walletId}`);
        expect(params.get("order")).toBe(contract.order ?? null);
        return Promise.resolve(
          new Response(
            JSON.stringify(
              fail ? { message: "upstream read failed" } : Number(params.get("offset") ?? 0) > 0 ? [] : rows,
            ),
            {
              status: fail ? 500 : 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      },
    },
  });
}

const position = {
  id: "position-a",
  instrument: "Example",
  buy_date: "2026-01-01",
  buy_price: "123456789012.12345678",
  quantity: "0.00000001",
  current_price: "123456789012.12345679",
  price_date: "2026-10-01",
  wallet_id: "wallet-a",
  broker_label: null,
};
const positionColumns = [
  "id",
  "instrument",
  "buy_date",
  "buy_price::text",
  "quantity::text",
  "broker_label",
  "current_price::text",
  "price_date",
  "wallet_id",
  "wallets!positions_wallet_fkey(name)",
  "reason_categories(name)",
];
const joined = { ...position, wallets: { name: "Long term" }, reason_categories: { name: "Growth" } };
const mapped = { ...position, wallet_name: "Long term", category_name: "Growth" };
const wallet = { id: "wallet-a", name: "Long term", starting_value: "0.00000000" };
const walletColumns = ["id", "name", "starting_value::text"];

describe("financial read contracts", () => {
  it.each([undefined, "wallet-a"])("returns complete active list records for wallet %s", async (walletId) => {
    const client = transport(
      { table: "positions", columns: positionColumns, walletId, order: "buy_date.desc,created_at.desc,id.desc" },
      [joined],
    );
    expect(await listPositions(client, walletId)).toEqual([mapped]);
  });

  it("returns the requested active detail with its reason and joined names", async () => {
    const client = transport({ table: "positions", columns: [...positionColumns, "reason_text"], id: position.id }, [
      { ...joined, reason_text: "Keep the full reasoning" },
    ]);
    expect(await getPosition(client, position.id)).toEqual({ ...mapped, reason_text: "Keep the full reasoning" });
  });

  it("returns complete confrontation records in newest-buy order", async () => {
    const row = { ...position, category_id: "category-a", reason_text: "Earlier reasoning" };
    const client = transport(
      {
        table: "positions",
        columns: [
          "id",
          "category_id",
          "instrument",
          "buy_date",
          "buy_price::text",
          "quantity::text",
          "current_price::text",
          "price_date",
          "reason_text",
        ],
        order: "buy_date.desc,created_at.desc",
      },
      [row],
    );
    expect(await listConfrontationPositions(client)).toEqual([row]);
  });

  it("returns active wallets in name order and accepts a zero starting value", async () => {
    const client = transport({ table: "wallets", columns: walletColumns, order: "name.asc" }, [wallet]);
    expect(await listWallets(client)).toEqual([{ ...wallet, starting_value: "0" }]);
  });

  it("returns the requested active wallet and its exact starting value", async () => {
    const row = { ...wallet, starting_value: "999999999999.99999999" };
    const client = transport({ table: "wallets", columns: walletColumns, id: wallet.id }, [row]);
    expect(await getWallet(client, wallet.id)).toEqual(row);
  });

  it("reads all wallet members in stable id order", async () => {
    const client = transport(
      {
        table: "positions",
        columns: ["wallet_id", "buy_price::text", "quantity::text", "current_price::text", "price_date"],
        order: "id.asc",
      },
      [position],
    );
    expect(await listWalletPositions(client)).toEqual([position]);
  });

  it("returns null for unavailable position and wallet details", async () => {
    expect(
      await getPosition(transport({ table: "positions", columns: positionColumns, id: "missing" }, []), "missing"),
    ).toBeNull();
    expect(
      await getWallet(transport({ table: "wallets", columns: walletColumns, id: "missing" }, []), "missing"),
    ).toBeNull();
  });

  it("preserves read failures instead of returning empty lists or missing details", async () => {
    await expect(
      listWallets(transport({ table: "wallets", columns: walletColumns, order: "name.asc" }, [], true)),
    ).rejects.toThrow("upstream read failed");
    await expect(
      getWallet(transport({ table: "wallets", columns: walletColumns, id: wallet.id }, [], true), wallet.id),
    ).rejects.toThrow("upstream read failed");
    await expect(
      getPosition(transport({ table: "positions", columns: positionColumns, id: position.id }, [], true), position.id),
    ).rejects.toThrow("upstream read failed");
    await expect(
      listConfrontationPositions(
        transport({ table: "positions", columns: ["reason_text"], order: "buy_date.desc,created_at.desc" }, [], true),
      ),
    ).rejects.toThrow("upstream read failed");
  });
});
