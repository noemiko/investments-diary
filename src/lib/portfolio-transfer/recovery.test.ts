import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import { examplePortfolio } from "./fixtures";
import { previewRecovery, replacePortfolio, undoPortfolio } from "./recovery";

const user = "00000000-0000-4000-8000-000000000001";
const operation = "00000000-0000-4000-8000-000000000002";
const snapshot = "00000000-0000-4000-8000-000000000003";
const fingerprint = "a".repeat(64);
const counts = { wallets: 2, open: 1, closed: 1, deleted: 0, snapshots: 0 };
const result = { operation_id: operation, undo_snapshot_id: snapshot, counts };
function client(data: unknown, code?: string) {
  const rpc = vi.fn().mockResolvedValue({ data, error: code ? { code } : null });
  return { rpc, db: { rpc } as unknown as SupabaseClient<ApiDatabase> };
}
it("reads destination and undo metadata without exposing either stored payload", async () => {
  const preview = { fingerprint, counts, undo: { snapshot_id: snapshot, saved_at: "2026-11-23T00:00:00Z", counts } };
  const { rpc, db } = client(preview);
  expect(await previewRecovery(db, user)).toEqual(preview);
  expect(rpc).toHaveBeenCalledWith("portfolio_recovery_preview", { in_user_id: user });
});
it("binds destination separately from original record IDs and keeps financial text in replacement arguments", async () => {
  const { rpc, db } = client(result);
  const data = examplePortfolio().data;
  expect(await replacePortfolio(db, user, data, fingerprint, operation)).toEqual(result);
  expect(rpc).toHaveBeenCalledWith("portfolio_replace", {
    in_user_id: user,
    in_data: data,
    in_fingerprint: fingerprint,
    in_operation_id: operation,
  });
  expect(data.wallets[0].starting_value).toBe("999999999999.12345678");
});
it("binds undo to the previewed snapshot and operation identity", async () => {
  const { rpc, db } = client(result);
  expect(await undoPortfolio(db, user, fingerprint, operation, snapshot)).toEqual(result);
  expect(rpc).toHaveBeenCalledWith("portfolio_undo", {
    in_user_id: user,
    in_fingerprint: fingerprint,
    in_operation_id: operation,
    in_snapshot_id: snapshot,
  });
});
it.each([
  ["40001", "stale_preview"],
  ["55P03", "busy"],
  ["57014", "busy"],
  ["40P01", "busy"],
  ["22023", "invalid_request"],
])("maps expected database code %s to %s", async (code, reason) => {
  const { db } = client(null, code);
  await expect(replacePortfolio(db, user, examplePortfolio().data, fingerprint, operation)).rejects.toThrow(reason);
});
it("rejects malformed inputs without a destructive database call", async () => {
  const { rpc, db } = client(result);
  await expect(previewRecovery(db, "foreign-input")).rejects.toThrow("invalid_request");
  await expect(undoPortfolio(db, user, "bad", operation, snapshot)).rejects.toThrow("invalid_request");
  const broken = examplePortfolio().data;
  broken.positions[0].wallet_id = operation;
  await expect(replacePortfolio(db, user, broken, fingerprint, operation)).rejects.toThrow("invalid_request");
  expect(rpc).not.toHaveBeenCalled();
});
it("rejects malformed database metadata and reports unexpected failures through the existing service boundary", async () => {
  await expect(previewRecovery(client({ data: "not metadata" }).db, user)).rejects.toThrow(
    "Service failure: portfolioRecovery",
  );
  await expect(previewRecovery(client(null, "XX000").db, user)).rejects.toThrow("Service failure: portfolioRecovery");
});
