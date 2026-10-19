import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/db/database.types";
import { listPositions } from "@/lib/services/positions";
import { listWalletPositions } from "@/lib/services/wallets";
import { groupByWallet, walletValue } from "@/lib/wallet";

// Exercise the real Supabase query builder against a capped PostgREST transport fixture.
// This verifies request identity/filters, not the database's RLS implementation.
function fixture(count: number, cap = 1000, failAfter?: number) {
  const requests: URL[] = [];
  const rows = Array.from({ length: count }, (_, index) => ({
    id: String(index).padStart(6, "0"),
    wallet_id: index % 2 === 0 ? "one" : "two",
    buy_price: 10,
    current_price: 12,
    quantity: index === count - 1 ? null : 1,
    price_date: index === count - 2 ? "2026-01-01" : "2026-10-01",
    buy_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    wallets: { name: index % 2 === 0 ? "One" : "Two" },
    reason_categories: { name: "Category" },
  }));
  const client = createClient<Database>("http://localhost:54321", "request-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: "Bearer author-session" },
      fetch: (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requests.push(url);
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer author-session");
        expect(url.searchParams.get("deleted_at")).toBe("is.null");
        expect(url.searchParams.get("order")?.split(",").at(-1)).toMatch(/^id\.(asc|desc)$/);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (failAfter !== undefined && offset >= failAfter) {
          return Promise.resolve(new Response(JSON.stringify({ message: "later page failed" }), { status: 500 }));
        }
        const wallet = url.searchParams.get("wallet_id")?.replace(/^eq\./, "");
        const filtered = wallet ? rows.filter((row) => row.wallet_id === wallet) : rows;
        const limit = Math.min(Number(url.searchParams.get("limit") ?? cap), cap);
        return Promise.resolve(
          new Response(JSON.stringify(filtered.slice(offset, offset + limit)), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      },
    },
  });
  return { client, requests };
}

describe("complete wallet reads", () => {
  it.each([1200, 2400])("agrees across summary and detail for %i positions", async (count) => {
    const { client } = fixture(count);
    const all = await listWalletPositions(client);
    expect(all).toHaveLength(count);
    const groups = groupByWallet(all);
    for (const walletId of ["one", "two"]) {
      const members = await listPositions(client, walletId);
      expect(members).toHaveLength(count / 2);
      expect(members.every((member) => member.wallet_id === walletId)).toBe(true);
      const expected = {
        value: 100 + count - (walletId === "two" ? 2 : 0),
        counted: count / 2 - (walletId === "two" ? 1 : 0),
        notCounted: walletId === "two" ? 1 : 0,
        asOf: walletId === "one" ? "2026-01-01" : "2026-10-01",
      };
      expect(walletValue({ starting_value: 100 }, groups.get(walletId) ?? [])).toMatchObject(expected);
      expect(walletValue({ starting_value: 100 }, members)).toMatchObject(expected);
    }
  });

  it("continues when the server returns fewer rows than requested", async () => {
    const { client } = fixture(1200, 137);
    expect(await listWalletPositions(client)).toHaveLength(1200);
    expect(await listPositions(client)).toHaveLength(1200);
  });

  it("handles an empty dataset", async () => {
    const { client } = fixture(0);
    expect(await listWalletPositions(client)).toEqual([]);
    expect(await listPositions(client, "one")).toEqual([]);
  });

  it("rejects the whole read when a later page fails", async () => {
    const { client } = fixture(2400, 1000, 500);
    await expect(listWalletPositions(client)).rejects.toThrow("later page failed");
    await expect(listPositions(client, "one")).rejects.toThrow("later page failed");
  });
});
