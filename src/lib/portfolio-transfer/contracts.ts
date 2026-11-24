import type { RecoveryCounts, RecoveryPreview } from "./recovery";

export type TransferAction = "status" | "export" | "preview" | "replace" | "undo-preview" | "undo";
export type TransferFailureReason =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "invalid_file"
  | "too_large"
  | "export_too_large"
  | "invalid_signature"
  | "wrong_deployment"
  | "not_configured"
  | "invalid_confirmation"
  | "expired_preview"
  | "stale_preview"
  | "busy"
  | "no_undo"
  | "unexpected";
export interface TransferFailure {
  ok: false;
  reason: TransferFailureReason;
}
export interface TransferPreview {
  ok: true;
  token: string;
  operation: "replace" | "undo";
  snapshot_id: string | null;
  source: { exported_at: string; export_id: string | null; counts: RecoveryCounts };
  destination: RecoveryCounts;
}
export interface TransferStatus {
  ok: true;
  undo: RecoveryPreview["undo"];
}
export interface TransferSuccess {
  ok: true;
  redirect: "/dashboard";
}
