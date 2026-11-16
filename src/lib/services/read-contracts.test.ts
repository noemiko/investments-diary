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
  closing_commission: "0",
  sell_price: null,
  sell_date: null,
  opening_commission: "0",
  buy_price: "123456789012.12345678",
  quantity: "0.00000001",
  current_price: "123456789012.12345679",
  price_date: "2026-10-01",
  wallet_id: "wallet-a",
  broker_label: null,
};
const effective = {
  selected_price: position.current_price,
  selected_date: position.price_date,
  selected_at: null,
  selected_source: "manual",
  wallet_currency: "USD",
  quote_state: "unlinked",
  refresh_outcome: null,
  cooldown_until: null,
  manual_price_saved_at: null,
  quote_market_at: null,
  quote_fetched_at: null,
  quote_symbol: null,
  quote_exchange: null,
  quote_currency: null,
  quote_timezone: null,
  listing_name: null,
  exchange_name: null,
  instrument_type: null,
  market_state: null,
  delay_minutes: null,
  pending_symbol: null,
  pending_name: null,
  pending_exchange: null,
  pending_exchange_name: null,
  pending_instrument_type: null,
  pending_outcome: null,
  pending_cooldown_until: null,
  pending_lease_until: null,
  pending_currency: null,
};
const valuation = {
  source: "manual",
  currency: "USD",
  selectedAt: null,
  marketAt: null,
  fetchedAt: null,
  quoteState: "unlinked",
  refreshOutcome: null,
  cooldownUntil: null,
  manualSavedAt: null,
  manualPrice: position.current_price,
  manualPriceDate: position.price_date,
  listing: null,
  marketState: null,
  delayMinutes: null,
  pendingSelection: null,
  pendingCurrency: null,
};
const positionColumns = [
  "id",
  "instrument",
  "buy_date",
  "buy_price::text",
  "opening_commission::text",
  "closing_commission::text",
  "quantity::text",
  "broker_label",
  "sell_price::text",
  "sell_date",
  "current_price::text",
  "price_date",
  "wallet_id",
  "wallets!positions_wallet_fkey(name)",
  "reason_categories(name)",
  "pending_symbol",
  "pending_currency",
];
const joined = { ...position, ...effective, wallets: { name: "Long term" }, reason_categories: { name: "Growth" } };
const mapped = { ...position, valuation, wallet_name: "Long term", category_name: "Growth" };
const wallet = {
  id: "wallet-a",
  name: "Long term",
  starting_value: "0.00000000",
  currency: "USD",
};
const walletColumns = ["id", "name", "starting_value::text", "currency"];

describe("financial read contracts", () => {
  it.each([undefined, "wallet-a"])("returns complete active list records for wallet %s", async (walletId) => {
    const client = transport(
      {
        table: "position_effective_prices",
        columns: positionColumns,
        walletId,
        order: "buy_date.desc,created_at.desc,id.desc",
      },
      [joined],
    );
    expect(await listPositions(client, walletId)).toEqual([mapped]);
  });

  it("returns the requested active detail with its reason and joined names", async () => {
    const client = transport(
      { table: "position_effective_prices", columns: [...positionColumns, "reason_text"], id: position.id },
      [{ ...joined, reason_text: "Keep the full reasoning" }],
    );
    expect(await getPosition(client, position.id)).toEqual({ ...mapped, reason_text: "Keep the full reasoning" });
  });

  it("returns complete confrontation records in newest-buy order", async () => {
    const row = { ...position, category_id: "category-a", reason_text: "Earlier reasoning" };
    const client = transport(
      {
        table: "position_effective_prices",
        columns: [
          "id",
          "category_id",
          "instrument",
          "buy_date",
          "buy_price::text",
          "opening_commission::text",
          "closing_commission::text",
          "quantity::text",
          "sell_price::text",
          "sell_date",
          "current_price::text",
          "price_date",
          "reason_text",
        ],
        order: "buy_date.desc,created_at.desc,id.desc",
      },
      [{ ...row, ...effective }],
    );
    expect(await listConfrontationPositions(client)).toEqual([{ ...row, valuation }]);
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
        table: "position_effective_prices",
        columns: [
          "wallet_id",
          "buy_price::text",
          "opening_commission::text",
          "closing_commission::text",
          "quantity::text",
          "current_price::text",
          "price_date",
          "sell_price::text",
          "sell_date",
        ],
        order: "id.asc",
      },
      [{ ...position, ...effective }],
    );
    expect(await listWalletPositions(client)).toEqual([{ ...position, valuation }]);
  });

  it("returns null for unavailable position and wallet details", async () => {
    expect(
      await getPosition(
        transport({ table: "position_effective_prices", columns: positionColumns, id: "missing" }, []),
        "missing",
      ),
    ).toBeNull();
    expect(
      await getWallet(transport({ table: "wallets", columns: walletColumns, id: "missing" }, []), "missing"),
    ).toBeNull();
  });

  it("preserves read failures instead of returning empty lists or missing details", async () => {
    await expect(
      listWallets(transport({ table: "wallets", columns: walletColumns, order: "name.asc" }, [], true)),
    ).rejects.toHaveProperty("cause.message", "upstream read failed");
    await expect(
      getWallet(transport({ table: "wallets", columns: walletColumns, id: wallet.id }, [], true), wallet.id),
    ).rejects.toHaveProperty("cause.message", "upstream read failed");
    await expect(
      getPosition(
        transport({ table: "position_effective_prices", columns: positionColumns, id: position.id }, [], true),
        position.id,
      ),
    ).rejects.toHaveProperty("cause.message", "upstream read failed");
    await expect(
      listConfrontationPositions(
        transport(
          {
            table: "position_effective_prices",
            columns: ["reason_text"],
            order: "buy_date.desc,created_at.desc,id.desc",
          },
          [],
          true,
        ),
      ),
    ).rejects.toHaveProperty("cause.message", "upstream read failed");
  });
});
