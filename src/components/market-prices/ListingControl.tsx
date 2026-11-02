import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type {
  MarketCurrency,
  MarketListing,
  MarketListingCandidate,
  MarketListingLookupResult,
  MarketPriceServiceFailure,
  MarketSearchResult,
} from "@/types";
import { actionMessage, marketTimestamp, priceAction, refreshPriceFragments } from "./client";

type Lookup = Extract<MarketListingLookupResult, { ok: true }>;
export function ListingControl({
  positionId,
  currency,
  initialListing,
  initialSelection = null,
}: {
  positionId: string;
  currency: MarketCurrency;
  initialListing: MarketListing | null;
  initialSelection?: MarketListingCandidate | null;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<MarketListingCandidate[]>([]);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [listing, setListing] = useState(initialListing);
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch {
      setMessage(
        "The listing service could not be reached. Your saved values and form input are unchanged. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function search() {
    setLookup(null);
    const result = await priceAction<MarketSearchResult | MarketPriceServiceFailure>(
      "/dashboard/market-prices/listings/search",
      { positionId, query },
    );
    if (!result.ok) {
      setCandidates([]);
      setMessage(actionMessage(result.reason, result.retryAfter));
      return;
    }
    setCandidates(result.listings);
    if (!result.listings.length)
      setMessage("No supported stock or ETF listings found. Try a different name or symbol.");
  }
  async function download(symbol: string) {
    setLookup(null);
    const result = await priceAction<MarketListingLookupResult>("/dashboard/market-prices/listings/download", {
      positionId,
      symbol,
    });
    if (!result.ok) {
      setMessage(actionMessage(result.reason, result.retryAfter));
      try {
        await refreshPriceFragments();
      } catch {
        /* The failure remains visible; existing displayed values are retained. */
      }
      return;
    }
    setLookup(result);
    try {
      await refreshPriceFragments();
      setMessage("Quote downloaded. Check the exchange, currency and timezone before confirming this listing.");
    } catch {
      setMessage(
        "Quote downloaded, but displayed results could not be refreshed. Your other form input is unchanged. You can inspect and confirm the candidate below.",
      );
    }
  }
  async function confirm() {
    if (!lookup) return;
    const result = await priceAction<{ ok: true } | MarketPriceServiceFailure>(
      "/dashboard/market-prices/listings/confirm",
      { positionId, lookupId: lookup.lookupId },
    );
    if (!result.ok) {
      setMessage(actionMessage(result.reason, result.retryAfter));
      return;
    }
    setListing(lookup.listing);
    setLookup(null);
    try {
      await refreshPriceFragments();
      setMessage(
        "Listing confirmed. The result uses the saved price selected by the diary; manual corrections may still take precedence.",
      );
    } catch {
      setMessage(
        "Listing confirmed, but displayed values could not be refreshed. Your other form input is unchanged. Reload when ready.",
      );
    }
  }
  return (
    <section id="stock-listing" className="space-y-4 rounded-lg border p-4" aria-labelledby="listing-control-heading">
      <h2 id="listing-control-heading" className="text-lg font-semibold">
        Stock listing
      </h2>
      {listing ? (
        <p className="text-sm">
          Linked: <strong>{listing.symbol}</strong> · {listing.exchangeName} ({listing.exchange}) · {listing.currency} ·{" "}
          {listing.timezone}
        </p>
      ) : initialSelection ? (
        <p className="text-sm">
          Selected: <strong>{initialSelection.symbol}</strong> · {initialSelection.name} ·{" "}
          {initialSelection.exchangeName} ({initialSelection.exchange}). Use Download prices on the dashboard, or choose
          another listing below.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">No listing linked. Manual price entry is available.</p>
      )}
      <p className="text-muted-foreground text-sm">
        Wallet currency: {currency}. Search retrieves listing names only. Quotes require Download prices.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(search);
        }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="listing-query" className="text-sm">
            Company or symbol
          </label>
          <input
            id="listing-query"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            minLength={2}
            maxLength={100}
            required
            disabled={busy}
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2"
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy || query.trim().length < 2}>
          Search listings
        </Button>
      </form>
      {candidates.length > 0 && (
        <ul className="space-y-2">
          {candidates.map((candidate) => (
            <li
              key={`${candidate.symbol}:${candidate.exchange}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="text-sm">
                <strong>{candidate.name}</strong>
                <p>
                  {candidate.symbol} · {candidate.exchangeName} ({candidate.exchange}) · {candidate.instrumentType}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={`Download prices for ${candidate.symbol}`}
                onClick={() => {
                  void run(() => download(candidate.symbol));
                }}
              >
                Download prices
              </Button>
            </li>
          ))}
        </ul>
      )}
      {lookup && (
        <div className="bg-muted/30 space-y-2 rounded-md p-3 text-sm">
          <p className="font-semibold">
            Confirm listing: {lookup.listing.name} ({lookup.listing.symbol})
          </p>
          <p>
            {lookup.listing.exchangeName} ({lookup.listing.exchange}) · {lookup.listing.currency} ·{" "}
            {lookup.listing.timezone}
          </p>
          <p>
            Downloaded candidate quote: {formatNumber(lookup.quote.price)} {lookup.listing.currency}
          </p>
          <p>
            Market time: {marketTimestamp(lookup.quote.marketAt)} · {lookup.quote.marketState}
          </p>
          <p className="text-muted-foreground">
            This candidate quote is separate from the selected result. Confirmation reuses this download without another
            provider request.
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void run(confirm);
            }}
          >
            Confirm listing
          </Button>
        </div>
      )}
      {busy && <p className="text-muted-foreground text-sm">Working…</p>}
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
      <noscript>
        <p className="text-muted-foreground text-sm">
          Enable JavaScript to search and link listings. Manual price entry remains available.
        </p>
      </noscript>
    </section>
  );
}
