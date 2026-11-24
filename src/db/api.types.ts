import type { Database, Json } from "@/db/database.types";

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
// The selection guard derives market_target_id from the receipt; NOT NULL makes the receipt mandatory.
type SelectedInsert<T extends { Insert: unknown }> = Omit<T, "Insert"> & {
  Insert: Omit<T["Insert"], "market_target_id" | "market_selection_receipt_id"> & {
    market_selection_receipt_id: string;
    market_target_id?: never;
  };
};
type Functions = Database["public"]["Functions"];

export type ApiDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Tables, "positions" | "wallets" | "wallet_snapshots" | "market_quote_cache"> & {
      positions: SelectedInsert<
        DecimalWrites<
          Tables["positions"],
          "buy_price" | "quantity" | "current_price" | "sell_price" | "opening_commission" | "closing_commission"
        >
      >;
      market_quote_cache: DecimalWrites<
        Tables["market_quote_cache"],
        "price" | "delay_minutes" | "source_interval_minutes"
      >;
      wallets: DecimalWrites<Tables["wallets"], "starting_value">;
      wallet_snapshots: DecimalWrites<
        Tables["wallet_snapshots"],
        "starting_value" | "value" | "realised_change" | "open_change"
      >;
    };
    Functions: Omit<
      Functions,
      "finish_market_quote_refresh" | "claim_market_quote_refresh" | "claim_listing_lookup"
    > & {
      portfolio_export_snapshot: { Args: never; Returns: Json };
      portfolio_recovery_preview: { Args: { in_user_id: string }; Returns: Json };
      portfolio_replace: {
        Args: { in_user_id: string; in_data: Json; in_fingerprint: string; in_operation_id: string };
        Returns: Json;
      };
      portfolio_undo: {
        Args: { in_user_id: string; in_fingerprint: string; in_operation_id: string; in_snapshot_id: string };
        Returns: Json;
      };
      claim_listing_lookup: Omit<Functions["claim_listing_lookup"], "Returns"> & { Returns: string | null };
      claim_market_quote_refresh: Omit<Functions["claim_market_quote_refresh"], "Returns"> & { Returns: string | null };
      finish_market_quote_refresh: Omit<Functions["finish_market_quote_refresh"], "Args"> & {
        Args: TextFields<
          Functions["finish_market_quote_refresh"]["Args"],
          "in_price" | "in_delay_minutes" | "in_source_interval_minutes"
        >;
      };
    };
  };
};
