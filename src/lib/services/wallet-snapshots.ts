import type { createClient } from "@/lib/supabase";
import { readAll } from "@/lib/services/read-all";
import { aggregateUnits } from "@/lib/wallet-history";
import type { WalletSnapshot } from "@/types";

/** RLS enforces ownership; deterministic pagination stays below the API row cap. */
export async function listWalletSnapshots(
  client: ReturnType<typeof createClient>,
  walletId: string,
): Promise<WalletSnapshot[]> {
  const rows = await readAll("listWalletSnapshots", (from, to) =>
    client
      .from("wallet_snapshots")
      .select(
        "wallet_id,observation_day,captured_at,starting_value::text,value::text,realised_change::text,open_change::text,realised_count,open_count,not_counted,as_of",
      )
      .eq("wallet_id", walletId)
      .order("observation_day", { ascending: true })
      .range(from, to)
      .overrideTypes<WalletSnapshot[], { merge: false }>(),
  );
  for (const row of rows)
    for (const key of ["starting_value", "value", "realised_change", "open_change"] as const) aggregateUnits(row[key]);
  return rows;
}
