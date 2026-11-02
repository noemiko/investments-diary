export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      market_listing_lookups: {
        Row: {
          cache_id: string | null
          cooldown_until: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          position_id: string
          symbol: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          cache_id?: string | null
          cooldown_until?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          position_id: string
          symbol: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          cache_id?: string | null
          cooldown_until?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          position_id?: string
          symbol?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_listing_lookups_cache_id_user_id_fkey"
            columns: ["cache_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_quote_cache"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "market_listing_lookups_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "position_effective_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listing_lookups_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_listing_targets: {
        Row: {
          cache_id: string | null
          cooldown_until: string | null
          exchange: string
          exchange_name: string
          id: string
          instrument_type: string
          lease_token: string | null
          lease_until: string | null
          listing_name: string
          provider: string
          refresh_outcome: string
          symbol: string
          user_id: string
        }
        Insert: {
          cache_id?: string | null
          cooldown_until?: string | null
          exchange: string
          exchange_name: string
          id?: string
          instrument_type: string
          lease_token?: string | null
          lease_until?: string | null
          listing_name: string
          provider: string
          refresh_outcome?: string
          symbol: string
          user_id: string
        }
        Update: {
          cache_id?: string | null
          cooldown_until?: string | null
          exchange?: string
          exchange_name?: string
          id?: string
          instrument_type?: string
          lease_token?: string | null
          lease_until?: string | null
          listing_name?: string
          provider?: string
          refresh_outcome?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listing_targets_cache_id_user_id_fkey"
            columns: ["cache_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_quote_cache"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      market_quote_cache: {
        Row: {
          attempted_at: string | null
          cooldown_until: string | null
          created_at: string
          currency: string
          delay_minutes: number | null
          exchange: string
          exchange_name: string
          fetched_at: string | null
          id: string
          instrument_type: string
          lease_token: string | null
          lease_until: string | null
          listing_name: string
          market_at: string | null
          market_date: string | null
          market_state: string | null
          price: number | null
          provider: string
          refresh_outcome: string
          source_interval_minutes: number | null
          source_name: string | null
          symbol: string
          timezone: string
          user_id: string
        }
        Insert: {
          attempted_at?: string | null
          cooldown_until?: string | null
          created_at?: string
          currency: string
          delay_minutes?: number | null
          exchange: string
          exchange_name: string
          fetched_at?: string | null
          id?: string
          instrument_type: string
          lease_token?: string | null
          lease_until?: string | null
          listing_name: string
          market_at?: string | null
          market_date?: string | null
          market_state?: string | null
          price?: number | null
          provider: string
          refresh_outcome?: string
          source_interval_minutes?: number | null
          source_name?: string | null
          symbol: string
          timezone: string
          user_id: string
        }
        Update: {
          attempted_at?: string | null
          cooldown_until?: string | null
          created_at?: string
          currency?: string
          delay_minutes?: number | null
          exchange?: string
          exchange_name?: string
          fetched_at?: string | null
          id?: string
          instrument_type?: string
          lease_token?: string | null
          lease_until?: string | null
          listing_name?: string
          market_at?: string | null
          market_date?: string | null
          market_state?: string | null
          price?: number | null
          provider?: string
          refresh_outcome?: string
          source_interval_minutes?: number | null
          source_name?: string | null
          symbol?: string
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      market_selection_receipts: {
        Row: {
          id: string
          target_id: string
          user_id: string
          valid_until: string
          wallet_id: string
        }
        Insert: {
          id?: string
          target_id: string
          user_id: string
          valid_until?: string
          wallet_id: string
        }
        Update: {
          id?: string
          target_id?: string
          user_id?: string
          valid_until?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_selection_receipts_target_id_user_id_fkey"
            columns: ["target_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_listing_targets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "market_selection_receipts_wallet_id_user_id_fkey"
            columns: ["wallet_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      positions: {
        Row: {
          broker_label: string | null
          buy_date: string
          buy_price: number
          category_id: string
          created_at: string
          current_price: number | null
          deleted_at: string | null
          id: string
          instrument: string
          listing_confirmed_at: string | null
          manual_price_saved_at: string | null
          market_listing_id: string | null
          market_selection_receipt_id: string | null
          market_target_id: string | null
          price_date: string | null
          quantity: number | null
          reason_text: string | null
          sell_date: string | null
          sell_price: number | null
          user_id: string
          wallet_id: string
        }
        Insert: {
          broker_label?: string | null
          buy_date: string
          buy_price: number
          category_id: string
          created_at?: string
          current_price?: number | null
          deleted_at?: string | null
          id?: string
          instrument: string
          listing_confirmed_at?: string | null
          manual_price_saved_at?: string | null
          market_listing_id?: string | null
          market_selection_receipt_id?: string | null
          market_target_id?: string | null
          price_date?: string | null
          quantity?: number | null
          reason_text?: string | null
          sell_date?: string | null
          sell_price?: number | null
          user_id: string
          wallet_id: string
        }
        Update: {
          broker_label?: string | null
          buy_date?: string
          buy_price?: number
          category_id?: string
          created_at?: string
          current_price?: number | null
          deleted_at?: string | null
          id?: string
          instrument?: string
          listing_confirmed_at?: string | null
          manual_price_saved_at?: string | null
          market_listing_id?: string | null
          market_selection_receipt_id?: string | null
          market_target_id?: string | null
          price_date?: string | null
          quantity?: number | null
          reason_text?: string | null
          sell_date?: string | null
          sell_price?: number | null
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reason_categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "positions_listing_owner_fkey"
            columns: ["market_listing_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_quote_cache"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "positions_selection_owner_fkey"
            columns: ["market_selection_receipt_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_selection_receipts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "positions_target_owner_fkey"
            columns: ["market_target_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_listing_targets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "positions_wallet_fkey"
            columns: ["wallet_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      reason_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_snapshots: {
        Row: {
          as_of: string | null
          automatic_count: number | null
          captured_at: string
          currency: string
          manual_count: number | null
          not_counted: number
          observation_day: string
          oldest_market_at: string | null
          open_change: number
          open_count: number
          realised_change: number
          realised_count: number
          starting_value: number
          user_id: string
          value: number
          wallet_id: string
        }
        Insert: {
          as_of?: string | null
          automatic_count?: number | null
          captured_at?: string
          currency: string
          manual_count?: number | null
          not_counted: number
          observation_day: string
          oldest_market_at?: string | null
          open_change: number
          open_count: number
          realised_change: number
          realised_count: number
          starting_value: number
          user_id: string
          value: number
          wallet_id: string
        }
        Update: {
          as_of?: string | null
          automatic_count?: number | null
          captured_at?: string
          currency?: string
          manual_count?: number | null
          not_counted?: number
          observation_day?: string
          oldest_market_at?: string | null
          open_change?: number
          open_count?: number
          realised_change?: number
          realised_count?: number
          starting_value?: number
          user_id?: string
          value?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_snapshots_wallet_id_user_id_fkey"
            columns: ["wallet_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          name: string
          starting_value: number
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          name: string
          starting_value: number
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          name?: string
          starting_value?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      position_effective_prices: {
        Row: {
          broker_label: string | null
          buy_date: string | null
          buy_price: number | null
          category_id: string | null
          cooldown_until: string | null
          created_at: string | null
          current_price: number | null
          delay_minutes: number | null
          deleted_at: string | null
          exchange_name: string | null
          id: string | null
          instrument: string | null
          instrument_type: string | null
          lease_until: string | null
          listing_confirmed_at: string | null
          listing_name: string | null
          manual_price_saved_at: string | null
          market_listing_id: string | null
          market_state: string | null
          market_target_id: string | null
          pending_cooldown_until: string | null
          pending_currency: string | null
          pending_exchange: string | null
          pending_exchange_name: string | null
          pending_instrument_type: string | null
          pending_lease_until: string | null
          pending_name: string | null
          pending_outcome: string | null
          pending_symbol: string | null
          price_date: string | null
          quantity: number | null
          quote_currency: string | null
          quote_exchange: string | null
          quote_fetched_at: string | null
          quote_market_at: string | null
          quote_market_date: string | null
          quote_provider: string | null
          quote_state: string | null
          quote_symbol: string | null
          quote_timezone: string | null
          reason_text: string | null
          refresh_outcome: string | null
          selected_at: string | null
          selected_date: string | null
          selected_price: number | null
          selected_source: string | null
          sell_date: string | null
          sell_price: number | null
          source_interval_minutes: number | null
          source_name: string | null
          user_id: string | null
          wallet_currency: string | null
          wallet_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reason_categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "positions_listing_owner_fkey"
            columns: ["market_listing_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_quote_cache"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "positions_target_owner_fkey"
            columns: ["market_target_id", "user_id"]
            isOneToOne: false
            referencedRelation: "market_listing_targets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "positions_wallet_fkey"
            columns: ["wallet_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Functions: {
      capture_wallet_snapshots: { Args: never; Returns: number }
      claim_listing_lookup: { Args: { in_lookup_id: string }; Returns: string }
      claim_market_quote_refresh: {
        Args: { in_cache_id: string }
        Returns: string
      }
      claim_market_target: { Args: { in_target_id: string }; Returns: string }
      confirm_listing_lookup: {
        Args: { in_lookup_id: string; in_position_id: string }
        Returns: boolean
      }
      finish_listing_lookup: {
        Args: {
          in_cache_id?: string
          in_lookup_id: string
          in_release?: boolean
          in_retry_after?: string
          in_token: string
        }
        Returns: boolean
      }
      finish_market_quote_refresh: {
        Args: {
          in_cache_id: string
          in_delay_minutes?: number
          in_fetched_at?: string
          in_market_at?: string
          in_market_date?: string
          in_market_state?: string
          in_outcome: string
          in_price?: number
          in_retry_after?: string
          in_source_interval_minutes?: number
          in_source_name?: string
          in_token: string
        }
        Returns: boolean
      }
      finish_market_target: {
        Args: {
          in_cache_id?: string
          in_outcome: string
          in_release?: boolean
          in_retry_after?: string
          in_target_id: string
          in_token: string
        }
        Returns: number
      }
      move_position_to_wallet: {
        Args: { in_position_id: string; in_wallet_id: string }
        Returns: string
      }
      release_market_quote_refresh: {
        Args: { in_cache_id: string; in_token: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

