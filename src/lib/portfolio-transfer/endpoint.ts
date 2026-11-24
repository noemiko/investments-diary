import type { APIContext } from "astro";
import { reportUnexpected } from "@/lib/observability/reporter";
import { createClient } from "@/lib/supabase";
import { portfolioTransferConfig } from "./config";
import { createRecoveryClient } from "./recovery-client";
import { previewRecovery, replacePortfolio, undoPortfolio, RecoveryError, type RecoveryCounts } from "./recovery";
import { TRANSFER_LIMITS, type PortfolioData } from "./schema";
import { TransferError } from "./signing";
import { decodeWorkbook, encodeWorkbook } from "./workbook";
import { readPortfolioExport } from "./export";
import { ConfirmationError, createConfirmation, portfolioDigest, undoDigest, verifyConfirmation } from "./confirmation";
import type { TransferAction, TransferFailureReason, TransferPreview } from "./contracts";

const BODY_LIMIT = TRANSFER_LIMITS.fileBytes + 64 * 1024;
const noStore = { "cache-control": "no-store" };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...noStore, "content-type": "application/json" },
  });
const failure = (reason: TransferFailureReason, status: number) => json({ ok: false, reason }, status);
class RequestError extends Error {
  constructor(public readonly reason: "invalid_request" | "too_large") {
    super(reason);
  }
}
async function boundedForm(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(type)) throw new RequestError("invalid_request");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT))
    throw new RequestError("too_large");
  if (!request.body) throw new RequestError("invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new RequestError("too_large");
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return await new Response(buffer, { headers: { "content-type": type } }).formData();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("invalid_request");
  } finally {
    reader.releaseLock();
  }
}
function text(form: FormData, name: string): string {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") throw new RequestError("invalid_request");
  return values[0];
}
async function uploaded(form: FormData): Promise<Buffer> {
  const files = form.getAll("file");
  if (files.length !== 1 || typeof files[0] === "string" || files[0].size === 0)
    throw new TransferError("invalid_file");
  if (files[0].size > TRANSFER_LIMITS.fileBytes) throw new TransferError("too_large");
  return Buffer.from(await files[0].arrayBuffer());
}
function counts(data: PortfolioData): RecoveryCounts {
  return {
    wallets: data.wallets.length,
    open: data.positions.filter((row) => row.sell_price === null).length,
    closed: data.positions.filter((row) => row.sell_price !== null).length,
    deleted: 0,
    snapshots: 0,
  };
}
export async function handlePortfolio(context: APIContext, action: TransferAction): Promise<Response> {
  const method = action === "export" || action === "status" ? "GET" : "POST";
  if (context.request.method !== method)
    return new Response(null, { status: 405, headers: { ...noStore, Allow: method } });
  const user = context.locals.user;
  if (!user) return failure("unauthenticated", 401);
  if (
    method === "POST" &&
    (context.request.headers.get("origin") !== context.url.origin ||
      context.request.headers.get("sec-fetch-site") === "cross-site")
  )
    return failure("forbidden", 403);
  try {
    const config = portfolioTransferConfig();
    if (action === "export") {
      const payload = await readPortfolioExport(
        createClient(context.request.headers, context.cookies),
        config.deploymentId,
      );
      const bytes = await encodeWorkbook(payload, config.keyRing);
      return new Response(Uint8Array.from(bytes).buffer, {
        headers: {
          ...noStore,
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="portfolio-${payload.exported_at.slice(0, 10)}.xlsx"`,
        },
      });
    }
    if (action === "status") {
      const preview = await previewRecovery(createRecoveryClient(), user.id);
      return json({ ok: true, undo: preview.undo });
    }
    const form = await boundedForm(context.request);
    if (action === "preview" || action === "replace") {
      const payload = await decodeWorkbook(await uploaded(form), config.keyRing, config.deploymentId);
      const digest = portfolioDigest(payload);
      if (action === "preview") {
        const destination = await previewRecovery(createRecoveryClient(), user.id);
        const token = createConfirmation(
          {
            user_id: user.id,
            deployment_id: config.deploymentId,
            operation: "replace",
            digest,
            fingerprint: destination.fingerprint,
            snapshot_id: null,
          },
          config.keyRing,
        );
        const result: TransferPreview = {
          ok: true,
          token,
          operation: "replace",
          snapshot_id: null,
          source: { exported_at: payload.exported_at, export_id: payload.export_id, counts: counts(payload.data) },
          destination: destination.counts,
        };
        return json(result);
      }
      if (text(form, "confirmation") !== "REPLACE PORTFOLIO") throw new ConfirmationError("invalid_confirmation");
      const token = verifyConfirmation(
        text(form, "token"),
        { user_id: user.id, deployment_id: config.deploymentId, operation: "replace", digest },
        config.keyRing,
      );
      if (token.snapshot_id !== null) throw new ConfirmationError("invalid_confirmation");
      await replacePortfolio(createRecoveryClient(), user.id, payload.data, token.fingerprint, token.operation_id);
      return json({ ok: true, redirect: "/dashboard" });
    }
    if (action === "undo-preview") {
      const destination = await previewRecovery(createRecoveryClient(), user.id);
      if (!destination.undo) return failure("no_undo", 404);
      const saved = destination.undo;
      const token = createConfirmation(
        {
          user_id: user.id,
          deployment_id: config.deploymentId,
          operation: "undo",
          digest: undoDigest(saved.snapshot_id),
          fingerprint: destination.fingerprint,
          snapshot_id: saved.snapshot_id,
        },
        config.keyRing,
      );
      const result: TransferPreview = {
        ok: true,
        token,
        operation: "undo",
        snapshot_id: saved.snapshot_id,
        source: { exported_at: saved.saved_at, export_id: null, counts: saved.counts },
        destination: destination.counts,
      };
      return json(result);
    }
    if (text(form, "confirmation") !== "REPLACE PORTFOLIO") throw new ConfirmationError("invalid_confirmation");
    const snapshotId = text(form, "snapshot_id");
    const token = verifyConfirmation(
      text(form, "token"),
      { user_id: user.id, deployment_id: config.deploymentId, operation: "undo", digest: undoDigest(snapshotId) },
      config.keyRing,
    );
    if (token.snapshot_id !== snapshotId) throw new ConfirmationError("invalid_confirmation");
    await undoPortfolio(createRecoveryClient(), user.id, token.fingerprint, token.operation_id, snapshotId);
    return json({ ok: true, redirect: "/dashboard" });
  } catch (error) {
    if (error instanceof RequestError) return failure(error.reason, error.reason === "too_large" ? 413 : 400);
    if (error instanceof TransferError) {
      if (action === "export" && error.reason === "too_large") return failure("export_too_large", 413);
      return failure(error.reason, error.reason === "not_configured" ? 503 : error.reason === "too_large" ? 413 : 400);
    }
    if (error instanceof ConfirmationError)
      return failure(error.reason, error.reason === "expired_preview" ? 409 : 400);
    if (error instanceof RecoveryError) return failure(error.reason, error.reason === "invalid_request" ? 400 : 409);
    reportUnexpected(error, {
      operation: action === "export" ? "portfolioExport" : "portfolioRecovery",
      route: `/dashboard/portfolio/${action}`,
    });
    return failure("unexpected", 500);
  }
}
