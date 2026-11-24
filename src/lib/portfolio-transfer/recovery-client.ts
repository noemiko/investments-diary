import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "astro:env/server";
import type { ApiDatabase } from "@/db/api.types";
import { portfolioTransferConfig } from "./config";
import { TransferError } from "./signing";

/** Never import into client components. Authentication and owner binding happen before use. */
export function createRecoveryClient() {
  const { serviceRoleKey } = portfolioTransferConfig();
  const url = new URL(SUPABASE_URL);
  if (import.meta.env.DEV && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new TransferError("not_configured");
  return createClient<ApiDatabase>(url.origin, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
