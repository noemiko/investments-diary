import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "astro/zod";
import type { ApiDatabase } from "@/db/api.types";
import { serviceError } from "@/lib/observability/reporter";
import { isUuid } from "@/lib/validation/uuid";
import { portfolioDataSchema, type PortfolioData } from "./schema";

type Client = Pick<SupabaseClient<ApiDatabase>, "rpc">;
const count = z.number().int().nonnegative();
export const recoveryCountsSchema = z.strictObject({
  wallets: count,
  open: count,
  closed: count,
  deleted: count,
  snapshots: count,
});
export const recoveryPreviewSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  counts: recoveryCountsSchema,
  undo: z
    .strictObject({ snapshot_id: z.uuid(), saved_at: z.iso.datetime({ offset: true }), counts: recoveryCountsSchema })
    .nullable(),
});
export const recoveryResultSchema = z.strictObject({
  operation_id: z.uuid(),
  undo_snapshot_id: z.uuid(),
  counts: recoveryCountsSchema,
});
export type RecoveryCounts = z.infer<typeof recoveryCountsSchema>;
export type RecoveryPreview = z.infer<typeof recoveryPreviewSchema>;
export type RecoveryResult = z.infer<typeof recoveryResultSchema>;
export class RecoveryError extends Error {
  constructor(public readonly reason: "stale_preview" | "busy" | "invalid_request") {
    super(reason);
  }
}
function validOwner(userId: string) {
  if (!isUuid(userId)) throw new RecoveryError("invalid_request");
}
function validCommit(userId: string, fingerprint: string, operationId: string) {
  validOwner(userId);
  if (!isUuid(operationId) || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new RecoveryError("invalid_request");
}
function databaseFailure(error: { code: string }) {
  if (error.code === "40001") throw new RecoveryError("stale_preview");
  if (["55P03", "57014", "40P01"].includes(error.code)) throw new RecoveryError("busy");
  if (error.code === "22023") throw new RecoveryError("invalid_request");
  throw serviceError("portfolioRecovery", error);
}

/** Caller supplies a server-only service client and binds userId from the authenticated session. */
export async function previewRecovery(client: Client, userId: string): Promise<RecoveryPreview> {
  validOwner(userId);
  const { data, error } = await client.rpc("portfolio_recovery_preview", { in_user_id: userId });
  if (error) databaseFailure(error);
  const parsed = recoveryPreviewSchema.safeParse(data);
  if (!parsed.success) throw serviceError("portfolioRecovery", new Error("Invalid recovery preview response"));
  return parsed.data;
}
export async function replacePortfolio(
  client: Client,
  userId: string,
  data: PortfolioData,
  fingerprint: string,
  operationId: string,
): Promise<RecoveryResult> {
  validCommit(userId, fingerprint, operationId);
  const parsedData = portfolioDataSchema.safeParse(data);
  if (!parsedData.success) throw new RecoveryError("invalid_request");
  const result = await client.rpc("portfolio_replace", {
    in_user_id: userId,
    in_data: parsedData.data,
    in_fingerprint: fingerprint,
    in_operation_id: operationId,
  });
  if (result.error) databaseFailure(result.error);
  const parsed = recoveryResultSchema.safeParse(result.data);
  if (!parsed.success) throw serviceError("portfolioRecovery", new Error("Invalid recovery result"));
  return parsed.data;
}
export async function undoPortfolio(
  client: Client,
  userId: string,
  fingerprint: string,
  operationId: string,
  snapshotId: string,
): Promise<RecoveryResult> {
  validCommit(userId, fingerprint, operationId);
  if (!isUuid(snapshotId)) throw new RecoveryError("invalid_request");
  const result = await client.rpc("portfolio_undo", {
    in_user_id: userId,
    in_fingerprint: fingerprint,
    in_operation_id: operationId,
    in_snapshot_id: snapshotId,
  });
  if (result.error) databaseFailure(result.error);
  const parsed = recoveryResultSchema.safeParse(result.data);
  if (!parsed.success) throw serviceError("portfolioRecovery", new Error("Invalid recovery result"));
  return parsed.data;
}
