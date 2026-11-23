import { randomUUID } from "node:crypto";
import type { createClient } from "@/lib/supabase";
import { serviceError } from "@/lib/observability/reporter";
import { recoveryPayloadSchema, type RecoveryPayload } from "./schema";

export async function readPortfolioExport(
  client: ReturnType<typeof createClient>,
  deploymentId: string,
): Promise<RecoveryPayload> {
  const result = await client.rpc("portfolio_export_snapshot");
  if (result.error) throw serviceError("portfolioExport", result.error);
  return recoveryPayloadSchema.parse({
    version: 1,
    export_id: randomUUID(),
    exported_at: new Date().toISOString(),
    deployment_id: deploymentId,
    data: result.data,
  });
}
