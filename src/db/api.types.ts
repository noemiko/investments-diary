import type { Database } from "@/db/database.types";

// PostgREST accepts JSON strings for numeric columns. Keep generated Row types unchanged:
// reads must explicitly select ::text before their values are safe to consume as strings.
type TextFields<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? string | Exclude<T[P], number> : T[P];
};
type DecimalWrites<
  T extends { Insert: unknown; Update: unknown },
  K extends keyof T["Insert"] & keyof T["Update"],
> = Omit<T, "Insert" | "Update"> & {
  Insert: TextFields<T["Insert"], K>;
  Update: TextFields<T["Update"], K>;
};
type Tables = Database["public"]["Tables"];

export type ApiDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Tables, "positions" | "wallets"> & {
      positions: DecimalWrites<Tables["positions"], "buy_price" | "quantity" | "current_price" | "sell_price">;
      wallets: DecimalWrites<Tables["wallets"], "starting_value">;
    };
  };
};
