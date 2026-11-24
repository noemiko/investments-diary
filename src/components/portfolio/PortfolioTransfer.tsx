import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RecoveryCounts } from "@/lib/portfolio-transfer/recovery";
import type {
  TransferFailure,
  TransferFailureReason,
  TransferPreview,
  TransferStatus,
  TransferSuccess,
} from "@/lib/portfolio-transfer/contracts";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const messages: Record<TransferFailureReason, string> = {
  unauthenticated: "Your session has ended. Sign in again before exporting or recovering a portfolio.",
  forbidden: "This request could not be verified. Reload this page and try again.",
  invalid_request: "The request could not be read. Choose the original XLSX and preview again.",
  invalid_file: "This is not a supported recovery file. Choose the original XLSX downloaded from this app.",
  too_large: "This file exceeds the supported recovery limits. Choose an original export no larger than 4 MiB.",
  export_too_large: "Your portfolio exceeds the supported Excel export limits. No partial file was created.",
  invalid_signature: "The recovery data could not be verified. Choose an unchanged original export.",
  wrong_deployment: "This export belongs to a different diary installation and cannot be recovered here.",
  not_configured:
    "Export and recovery are not configured on this installation. Your existing diary is still available.",
  invalid_confirmation: "Type REPLACE PORTFOLIO exactly to confirm this preview.",
  expired_preview:
    "This preview has expired. Preview again before confirming; your portfolio has not been replaced by this request.",
  stale_preview:
    "Your portfolio or recovery copy changed after this preview. Preview again to review the current state.",
  busy: "The portfolio is busy. Nothing was replaced by this request. Wait a moment and try confirming again.",
  no_undo: "No recovery copy is available. Reload this page to check the latest state.",
  unexpected: "The operation could not be completed. Try again, or reload and preview before recovering.",
};
async function responseValue<T>(response: Response): Promise<T | TransferFailure> {
  if (response.redirected || response.status === 401) return { ok: false, reason: "unauthenticated" };
  if (!response.headers.get("content-type")?.includes("application/json")) return { ok: false, reason: "unexpected" };
  return (await response.json()) as T | TransferFailure;
}
function Counts({ title, value }: { title: string; value: RecoveryCounts }) {
  return (
    <div className="min-w-0 rounded-md border p-4">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt>Wallets</dt>
        <dd className="text-right tabular-nums">{value.wallets}</dd>
        <dt>Open investments</dt>
        <dd className="text-right tabular-nums">{value.open}</dd>
        <dt>Closed investments</dt>
        <dd className="text-right tabular-nums">{value.closed}</dd>
        <dt>Deleted investments</dt>
        <dd className="text-right tabular-nums">{value.deleted}</dd>
        <dt>Historical observations</dt>
        <dd className="text-right tabular-nums">{value.snapshots}</dd>
      </dl>
    </div>
  );
}
export function PortfolioTransfer({ available }: { available: boolean }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [undo, setUndo] = useState<TransferStatus["undo"]>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<TransferFailureReason | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const value = await responseValue<TransferStatus>(
          await fetch("/dashboard/portfolio/status", { cache: "no-store", signal: controller.signal }),
        );
        if (controller.signal.aborted) return;
        if (value.ok) setUndo(value.undo);
        else setError(value.reason);
      } catch {
        if (!controller.signal.aborted) setError("unexpected");
      }
    })();
    return () => {
      controller.abort();
    };
  }, [available]);
  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview]);
  function failed(reason: TransferFailureReason) {
    setError(reason);
    if (reason === "expired_preview" || reason === "stale_preview" || reason === "no_undo") {
      setPreview(null);
      setConfirmation("");
    }
  }
  async function perform(action: "export" | "preview" | "undo-preview" | "confirm") {
    if (pending.current || !available) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "export") {
        const response = await fetch("/dashboard/portfolio/export", { cache: "no-store" });
        if (response.redirected || !response.ok || !response.headers.get("content-type")?.includes("spreadsheetml")) {
          const value = await responseValue<{ ok: true }>(response);
          failed(!value.ok ? value.reason : "unexpected");
          return;
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download =
          /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "portfolio.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
        return;
      }
      const body = new FormData();
      let route: string = action;
      if (action === "confirm") {
        if (!preview || confirmation !== "REPLACE PORTFOLIO") return;
        route = preview.operation === "replace" ? "replace" : "undo";
        body.set("token", preview.token);
        body.set("confirmation", confirmation);
        if (preview.snapshot_id) body.set("snapshot_id", preview.snapshot_id);
      }
      if (action === "preview" || (action === "confirm" && preview?.operation === "replace")) {
        if (!file) {
          failed("invalid_file");
          return;
        }
        body.set("file", file);
      }
      const result = await responseValue<TransferPreview | TransferSuccess>(
        await fetch(`/dashboard/portfolio/${route}`, { method: "POST", body, cache: "no-store" }),
      );
      if (!result.ok) {
        failed(result.reason);
        return;
      }
      if ("redirect" in result) {
        window.location.assign(result.redirect);
        return;
      }
      setPreview(result);
      setConfirmation("");
    } catch {
      failed("unexpected");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      {!available && (
        <p role="status" className="rounded-md border p-4 text-sm">
          {messages.not_configured}
        </p>
      )}
      {error && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="border-destructive/40 text-destructive focus-visible:ring-ring rounded-md border p-4 text-sm outline-none focus-visible:ring-2"
        >
          <p>{messages[error]}</p>
          {error === "unauthenticated" && (
            <a href="/auth/signin?returnTo=%2Fdashboard%2Fportfolio" className="underline">
              Sign in again
            </a>
          )}
        </div>
      )}
      <section aria-labelledby="export-heading" className="space-y-3">
        <h2 id="export-heading" className="text-xl font-semibold">
          Export Excel
        </h2>
        <p className="text-muted-foreground text-sm">
          Keep the original downloaded XLSX unchanged for recovery. Open a separate copy in Excel or Google Sheets for
          personal analysis. Spreadsheet edits do not update this diary.
        </p>
        <Button
          type="button"
          disabled={!available || busy}
          onClick={() => {
            void perform("export");
          }}
        >
          Export Excel
        </Button>
      </section>
      <section aria-labelledby="recover-heading" className="space-y-3">
        <h2 id="recover-heading" className="text-xl font-semibold">
          Recover portfolio
        </h2>
        <p className="text-muted-foreground text-sm">
          Choose an original app export, up to 4 MiB. Recovery uses its verified original data, not edited visible cells
          or formulas. Google-converted files are not guaranteed recovery files.
        </p>
        <form
          method="POST"
          action="/dashboard/portfolio"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void perform("preview");
          }}
        >
          <label htmlFor="portfolio-file" className="block text-sm font-medium">
            Original portfolio XLSX
          </label>
          <input
            id="portfolio-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!available || busy}
            className={fieldClass}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setConfirmation("");
              setError(null);
            }}
          />
          <Button type="submit" disabled={!available || busy || !file}>
            Preview recovery
          </Button>
        </form>
      </section>
      <section aria-labelledby="undo-heading" className="space-y-3">
        <h2 id="undo-heading" className="text-xl font-semibold">
          Undo latest recovery
        </h2>
        {undo ? (
          <>
            <p className="text-muted-foreground text-sm">
              Previous portfolio saved at <time dateTime={undo.saved_at}>{undo.saved_at}</time>. This private copy
              includes its deleted investments and historical charts. It is retained until the next successful
              replacement or undo.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={!available || busy}
              onClick={() => {
                void perform("undo-preview");
              }}
            >
              Preview undo
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            No saved recovery copy is available yet. A successful recovery saves the current portfolio before replacing
            it.
          </p>
        )}
      </section>
      {preview && (
        <section aria-labelledby="preview-heading" className="space-y-4 rounded-md border p-4 sm:p-6">
          <h2
            ref={previewRef}
            tabIndex={-1}
            id="preview-heading"
            className="focus-visible:ring-ring text-xl font-semibold outline-none focus-visible:ring-2"
          >
            {preview.operation === "replace" ? "Review portfolio recovery" : "Review undo"}
          </h2>
          <p className="text-sm break-words">
            {preview.operation === "replace" ? "Original export dated" : "Recovery copy saved at"}{" "}
            <time dateTime={preview.source.exported_at}>{preview.source.exported_at}</time>
            {preview.source.export_id && <> · Export ID: {preview.source.export_id}</>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Counts title="Portfolio to restore" value={preview.source.counts} />
            <Counts title="Current portfolio to replace" value={preview.destination} />
          </div>
          <p className="text-sm">
            This replaces the current wallets and investments. Current deleted entries and historical charts also leave
            the active portfolio. A private copy of the current state is saved for undo in the same operation.
          </p>
          <p className="text-muted-foreground text-sm">
            Prices and their recorded source timestamps are restored as saved. No current prices are downloaded.
            Analysis edits in spreadsheet cells are not imported.
          </p>
          <form
            method="POST"
            action="/dashboard/portfolio"
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("confirm");
            }}
          >
            <label htmlFor="portfolio-confirmation" className="block text-sm font-medium">
              Type REPLACE PORTFOLIO to confirm
            </label>
            <input
              id="portfolio-confirmation"
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              disabled={busy}
              className={fieldClass}
              onChange={(event) => {
                setConfirmation(event.target.value);
              }}
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="destructive" disabled={busy || confirmation !== "REPLACE PORTFOLIO"}>
                {preview.operation === "replace" ? "Replace portfolio" : "Undo latest recovery"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setConfirmation("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}
      <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
        {busy ? "Working… Please keep this page open." : ""}
      </p>
      <noscript>
        <p className="text-sm">
          Enable JavaScript to export, preview recovery, or undo. Your saved diary remains available.
        </p>
      </noscript>
    </div>
  );
}
