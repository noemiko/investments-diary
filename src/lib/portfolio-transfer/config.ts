import { PORTFOLIO_RECOVERY_KEYS, PORTFOLIO_DEPLOYMENT_ID, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";
import { parseSigningKeyRing, TransferError } from "./signing";

/** Missing transfer settings disable transfer operations, never ordinary diary requests. */
export function portfolioTransferConfig() {
  if (!PORTFOLIO_RECOVERY_KEYS || !PORTFOLIO_DEPLOYMENT_ID || !SUPABASE_SERVICE_ROLE_KEY)
    throw new TransferError("not_configured");
  return {
    keyRing: parseSigningKeyRing(PORTFOLIO_RECOVERY_KEYS),
    deploymentId: PORTFOLIO_DEPLOYMENT_ID,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  };
}
