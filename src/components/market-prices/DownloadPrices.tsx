import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MarketPriceDownloadItem, MarketPriceServiceFailure } from "@/types";
import { actionMessage, priceAction, refreshPriceFragments } from "./client";

type Result = { ok: true; results: MarketPriceDownloadItem[] } | MarketPriceServiceFailure;
export function DownloadPrices({ enabled }: { enabled: boolean }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<MarketPriceDownloadItem[]>([]);
  async function download() {
    if (pending.current || !enabled) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await priceAction<Result>("/dashboard/market-prices/download", {});
      if (!result.ok) {
        setMessage(actionMessage(result.reason, result.retryAfter));
        return;
      }
      setResults(result.results);
      try {
        await refreshPriceFragments();
        setMessage(
          result.results.length
            ? "Download finished. Values below use the saved prices selected by the diary."
            : "No selected open holdings to download.",
        );
      } catch {
        setMessage(
          "Download finished, but the displayed values could not be refreshed. Your other form input is unchanged. Reload when ready.",
        );
      }
    } catch {
      setMessage("Prices could not be downloaded. Your saved values are unchanged. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-2" aria-label="Download stock prices">
      <Button
        type="button"
        disabled={busy || !enabled}
        onClick={() => {
          void download();
        }}
      >
        {busy ? "Downloading prices…" : "Download prices"}
      </Button>
      <p className="text-muted-foreground text-xs">
        Prices download only when you click. Opening or reloading a page uses saved prices.
      </p>
      <div role="status" aria-live="polite" className="text-sm">
        {message}
      </div>
      {results.length > 0 && (
        <ul className="space-y-1 text-sm">
          {results.map((result) => (
            <li key={result.listingId}>
              <span className="font-medium">{result.symbol}</span>:{" "}
              {result.outcome === "success"
                ? "Downloaded"
                : result.outcome === "due"
                  ? "Not attempted; click Download prices to try this holding later."
                  : result.outcome === "older_quote"
                    ? `An older quote was ignored. ${actionMessage("cooldown", result.retryAfter)}`
                    : actionMessage(result.outcome, result.retryAfter)}
              {Boolean(result.incompatibleCount) && (
                <span>
                  {" "}
                  {result.incompatibleCount} holding(s) use a different wallet currency and were not linked. Saved
                  manual prices are retained.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <noscript>
        <p className="text-muted-foreground text-sm">
          Enable JavaScript to download prices. Manual price entry remains available.
        </p>
      </noscript>
    </section>
  );
}
