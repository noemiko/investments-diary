import { expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { ApiDatabase } from "@/db/api.types";
import { decodePosition } from "@/lib/services/decimal";
import { getPosition, listConfrontationPositions, listPositions } from "@/lib/services/positions";
import { getWallet, listWalletPositions, listWallets } from "@/lib/services/wallets";

it("decodes nullable text without coercing already rounded JSON numbers", () => {
  expect(decodePosition({ buy_price: "50.00000000", current_price: null, quantity: null })).toEqual({
    buy_price: "50",
    current_price: null,
    quantity: null,
  });
  for (const field of ["buy_price", "current_price", "quantity"] as const) {
    expect(() =>
      decodePosition({ buy_price: "50", current_price: "60", quantity: "1", [field]: 12.12345678 }),
    ).toThrow();
    expect(() => decodePosition({ buy_price: "50", current_price: "60", quantity: "1", [field]: "0" })).toThrow();
  }
});

it("every service rejects corrupted decimal transport instead of displaying a partial total", async () => {
  const invalid = {
    id: "fixture",
    buy_price: 50,
    quantity: "1",
    current_price: "60",
    starting_value: 100,
    wallets: { name: "Wallet" },
    reason_categories: { name: "Reason" },
  };
  const client = createClient<ApiDatabase>("http://localhost:54321", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        return Promise.resolve(
          new Response(JSON.stringify(offset > 0 ? [] : [invalid]), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      },
    },
  });
  await expect(listPositions(client)).rejects.toThrow("decimal text");
  await expect(listConfrontationPositions(client)).rejects.toThrow("decimal text");
  await expect(getPosition(client, "fixture")).rejects.toThrow("decimal text");
  await expect(listWallets(client)).rejects.toThrow("decimal text");
  await expect(getWallet(client, "fixture")).rejects.toThrow("decimal text");
  await expect(listWalletPositions(client)).rejects.toThrow("decimal text");
});
