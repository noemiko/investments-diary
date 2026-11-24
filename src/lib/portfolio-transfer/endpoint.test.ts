import type { APIContext } from "astro";
import { beforeEach, expect, it, vi } from "vitest";
import { handlePortfolio } from "./endpoint";
import { portfolioTransferConfig } from "./config";
import { createRecoveryClient } from "./recovery-client";
import { createClient } from "@/lib/supabase";
import { previewRecovery, replacePortfolio, undoPortfolio, RecoveryError } from "./recovery";
import { readPortfolioExport } from "./export";
import { decodeWorkbook, encodeWorkbook } from "./workbook";
import { createConfirmation, portfolioDigest } from "./confirmation";
import { TransferError } from "./signing";
import { examplePortfolio } from "./fixtures";
import { TRANSFER_LIMITS } from "./schema";
import type { TransferAction, TransferPreview } from "./contracts";

vi.mock("./config", () => ({ portfolioTransferConfig: vi.fn() }));
vi.mock("./recovery-client", () => ({ createRecoveryClient: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("./recovery", async (original) => ({
  ...(await original<typeof import("./recovery")>()),
  previewRecovery: vi.fn(),
  replacePortfolio: vi.fn(),
  undoPortfolio: vi.fn(),
}));
vi.mock("./export", () => ({ readPortfolioExport: vi.fn() }));
vi.mock("./workbook", () => ({ decodeWorkbook: vi.fn(), encodeWorkbook: vi.fn() }));
vi.mock("@/lib/observability/reporter", () => ({
  reportUnexpected: vi.fn(),
  serviceError: (_operation: string, error: unknown) => error,
}));
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const snapshot = "00000000-0000-4000-8000-000000000003";
const fingerprint = "a".repeat(64);
const keyRing = { activeKeyId: "test", keys: { test: "synthetic-test-signing-key-over-32-characters" } };
const config = { keyRing, deploymentId: "test-diary", serviceRoleKey: "test-only" };
const counts = { wallets: 2, open: 1, closed: 1, deleted: 3, snapshots: 7 };
const metadata = { fingerprint, counts, undo: { snapshot_id: snapshot, saved_at: "2026-11-23T00:00:00Z", counts } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(portfolioTransferConfig).mockReturnValue(config);
  vi.mocked(previewRecovery).mockResolvedValue(metadata);
  vi.mocked(decodeWorkbook).mockResolvedValue(examplePortfolio());
  vi.mocked(readPortfolioExport).mockResolvedValue(examplePortfolio());
  vi.mocked(encodeWorkbook).mockResolvedValue(Buffer.from("xlsx fixture"));
  vi.mocked(replacePortfolio).mockResolvedValue({ operation_id: other, undo_snapshot_id: snapshot, counts });
  vi.mocked(undoPortfolio).mockResolvedValue({ operation_id: other, undo_snapshot_id: snapshot, counts });
});
function form(fields: Record<string, string> = {}, withFile = true) {
  const value = new FormData();
  if (withFile) value.set("file", new Blob(["original workbook"]), "portfolio.xlsx");
  for (const [name, text] of Object.entries(fields)) value.set(name, text);
  return value;
}
async function call(
  action: TransferAction,
  body?: BodyInit,
  options: {
    user?: boolean;
    owner?: string;
    origin?: string;
    method?: string;
    headers?: Record<string, string>;
    stream?: boolean;
  } = {},
) {
  const url = new URL(`https://diary.test/dashboard/portfolio/${action}`);
  const method = options.method ?? (action === "export" || action === "status" ? "GET" : "POST");
  const headers = { origin: options.origin ?? url.origin, ...options.headers };
  const init = {
    method,
    headers,
    ...(method === "GET" ? {} : { body }),
    ...(options.stream ? { duplex: "half" } : {}),
  };
  return await handlePortfolio(
    {
      url,
      request: new Request(url, init),
      locals: { user: options.user === false ? null : { id: options.owner ?? user } },
      cookies: {},
    } as unknown as APIContext,
    action,
  );
}
function replacementToken(owner = user, now = Date.now()) {
  return createConfirmation(
    {
      user_id: owner,
      deployment_id: config.deploymentId,
      operation: "replace",
      digest: portfolioDigest(examplePortfolio()),
      fingerprint,
      snapshot_id: null,
    },
    keyRing,
    now,
  );
}
it("checks method, session and origin before any configured or privileged service access", async () => {
  expect((await call("preview", form(), { user: false })).status).toBe(401);
  expect((await call("preview", form(), { origin: "https://foreign.test" })).status).toBe(403);
  expect((await call("replace", undefined, { method: "GET" })).status).toBe(405);
  expect(portfolioTransferConfig).not.toHaveBeenCalled();
  expect(createRecoveryClient).not.toHaveBeenCalled();
  expect(replacePortfolio).not.toHaveBeenCalled();
});
it("returns private downloadable XLSX from the request-scoped owner snapshot", async () => {
  const response = await call("export");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-disposition")).toContain('filename="portfolio-2026-11-23.xlsx"');
  expect(await response.text()).toBe("xlsx fixture");
  expect(createClient).toHaveBeenCalled();
  expect(createRecoveryClient).not.toHaveBeenCalled();
});
it("reports export limits without creating a partial downloadable attachment", async () => {
  vi.mocked(encodeWorkbook).mockRejectedValueOnce(new TransferError("too_large"));
  const response = await call("export");
  expect(response.status).toBe(413);
  expect(response.headers.get("content-disposition")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ok: false, reason: "export_too_large" });
  expect(createRecoveryClient).not.toHaveBeenCalled();
});
it("previews authenticated data, destination history and a session-bound confirmation", async () => {
  const response = await call("preview", form());
  const value = (await response.json()) as TransferPreview;
  expect(response.status).toBe(200);
  expect(value.source).toEqual({
    exported_at: examplePortfolio().exported_at,
    export_id: examplePortfolio().export_id,
    counts: { wallets: 2, open: 1, closed: 1, deleted: 0, snapshots: 0 },
  });
  expect(value.destination).toEqual(counts);
  expect(value.token).toBeTruthy();
  expect(value.snapshot_id).toBeNull();
  expect(replacePortfolio).not.toHaveBeenCalled();
});
it("rejects unsupported content types and oversized declared or streamed bodies before decoding or database access", async () => {
  expect((await call("preview", "{}", { headers: { "content-type": "application/json" } })).status).toBe(400);
  expect(
    (await call("preview", form(), { headers: { "content-length": String(TRANSFER_LIMITS.fileBytes + 65537) } }))
      .status,
  ).toBe(413);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(TRANSFER_LIMITS.fileBytes + 65537));
      controller.close();
    },
  });
  expect(
    (
      await call("preview", stream, {
        stream: true,
        headers: { "content-type": "multipart/form-data; boundary=bound" },
      })
    ).status,
  ).toBe(413);
  expect(decodeWorkbook).not.toHaveBeenCalled();
  expect(createRecoveryClient).not.toHaveBeenCalled();
});
it("rejects missing, duplicate and oversized file fields without privileged calls", async () => {
  expect((await call("preview", form({}, false))).status).toBe(400);
  const duplicate = form();
  duplicate.append("file", new Blob(["second"]), "second.xlsx");
  expect((await call("preview", duplicate)).status).toBe(400);
  const large = form({}, false);
  large.set("file", new Blob([new Uint8Array(TRANSFER_LIMITS.fileBytes + 1)]), "large.xlsx");
  expect((await call("preview", large)).status).toBe(413);
  expect(createRecoveryClient).not.toHaveBeenCalled();
});
it("does not access privileged data when workbook authenticity fails", async () => {
  vi.mocked(decodeWorkbook).mockRejectedValueOnce(new TransferError("invalid_signature"));
  const response = await call("replace", form({ token: replacementToken(), confirmation: "REPLACE PORTFOLIO" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ ok: false, reason: "invalid_signature" });
  expect(createRecoveryClient).not.toHaveBeenCalled();
});
it("requires exact phrase and valid owner-bound token before replacement", async () => {
  expect((await call("replace", form({ token: replacementToken(), confirmation: "replace portfolio" }))).status).toBe(
    400,
  );
  expect(
    (await call("replace", form({ token: replacementToken(other), confirmation: "REPLACE PORTFOLIO" }))).status,
  ).toBe(400);
  expect((await call("replace", form({ token: "changed", confirmation: "REPLACE PORTFOLIO" }))).status).toBe(400);
  expect(createRecoveryClient).not.toHaveBeenCalled();
  expect(replacePortfolio).not.toHaveBeenCalled();
});
it("rejects an expired preview without replacement", async () => {
  const response = await call(
    "replace",
    form({ token: replacementToken(user, Date.now() - 601_000), confirmation: "REPLACE PORTFOLIO" }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ ok: false, reason: "expired_preview" });
  expect(replacePortfolio).not.toHaveBeenCalled();
});
it("rejects a different recovery payload after preview", async () => {
  const token = replacementToken();
  const changed = examplePortfolio();
  changed.data.wallets[0].starting_value = "1";
  vi.mocked(decodeWorkbook).mockResolvedValueOnce(changed);
  expect((await call("replace", form({ token, confirmation: "REPLACE PORTFOLIO" }))).status).toBe(400);
  expect(replacePortfolio).not.toHaveBeenCalled();
});
it("binds confirmation to original export metadata even when portfolio facts match", async () => {
  const token = replacementToken();
  const changed = examplePortfolio();
  changed.export_id = other;
  vi.mocked(decodeWorkbook).mockResolvedValueOnce(changed);
  expect((await call("replace", form({ token, confirmation: "REPLACE PORTFOLIO" }))).status).toBe(400);
  expect(replacePortfolio).not.toHaveBeenCalled();
});
it("commits the verified payload to the session owner with the preview fingerprint and stable operation identity", async () => {
  const token = replacementToken();
  const response = await call("replace", form({ token, confirmation: "REPLACE PORTFOLIO" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, redirect: "/dashboard" });
  expect(replacePortfolio).toHaveBeenCalledWith(
    expect.anything(),
    user,
    examplePortfolio().data,
    fingerprint,
    expect.any(String),
  );
  const operation = vi.mocked(replacePortfolio).mock.calls[0][4];
  await call("replace", form({ token, confirmation: "REPLACE PORTFOLIO" }));
  expect(vi.mocked(replacePortfolio).mock.calls[1][4]).toBe(operation);
});
it("returns the exact undo snapshot identity from preview and binds commit to it", async () => {
  const response = await call("undo-preview", form({}, false));
  const value = (await response.json()) as TransferPreview;
  expect(value.snapshot_id).toBe(snapshot);
  expect(value.source.counts).toEqual(counts);
  const fields = { token: value.token, confirmation: "REPLACE PORTFOLIO", snapshot_id: snapshot };
  expect((await call("undo", form(fields, false))).status).toBe(200);
  expect(undoPortfolio).toHaveBeenCalledWith(expect.anything(), user, fingerprint, expect.any(String), snapshot);
  vi.mocked(undoPortfolio).mockClear();
  expect((await call("undo", form({ ...fields, snapshot_id: other }, false))).status).toBe(400);
  expect(undoPortfolio).not.toHaveBeenCalled();
});
it("does not accept a replacement confirmation for undo", async () => {
  const response = await call(
    "undo",
    form({ token: replacementToken(), confirmation: "REPLACE PORTFOLIO", snapshot_id: snapshot }, false),
  );
  expect(response.status).toBe(400);
  expect(undoPortfolio).not.toHaveBeenCalled();
});
it("reports stale and busy outcomes and unavailable configuration without exposing data", async () => {
  vi.mocked(replacePortfolio).mockRejectedValueOnce(new RecoveryError("stale_preview"));
  const fields = { token: replacementToken(), confirmation: "REPLACE PORTFOLIO" };
  const stale = await call("replace", form(fields));
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({ ok: false, reason: "stale_preview" });
  vi.mocked(replacePortfolio).mockRejectedValueOnce(new RecoveryError("busy"));
  const busy = await call("replace", form(fields));
  expect(await busy.json()).toEqual({ ok: false, reason: "busy" });
  vi.mocked(portfolioTransferConfig).mockImplementationOnce(() => {
    throw new TransferError("not_configured");
  });
  const disabled = await call("status");
  expect(disabled.status).toBe(503);
  expect(await disabled.json()).toEqual({ ok: false, reason: "not_configured" });
});
it("returns no undo when absent and never exposes fingerprints or stored data through status", async () => {
  const status = await call("status");
  expect(await status.json()).toEqual({ ok: true, undo: metadata.undo });
  vi.mocked(previewRecovery).mockResolvedValueOnce({ ...metadata, undo: null });
  const response = await call("undo-preview", form({}, false));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ ok: false, reason: "no_undo" });
});
