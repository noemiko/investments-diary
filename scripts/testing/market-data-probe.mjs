import { createYahooMarketData } from "../../src/lib/market-data/yahoo.ts";
import { performance } from "node:perf_hooks";

// Explicit opt-in: never load diary data, .env files, provider keys or arbitrary symbols.
if (process.argv.slice(2).join(" ") !== "--live") {
  console.error("Public-symbol network probe is opt-in. Run npm run probe:market-data -- --live with Node.js 24.");
  process.exitCode = 1;
} else {
  const symbols = ["AAPL", "PKO.WA"];
  const api = createYahooMarketData();
  const checks = [];
  const listings = [];
  for (const symbol of symbols) {
    const search = await api.searchListings(symbol);
    checks.push({
      operation: "search",
      symbol,
      passed: search.ok && search.listings.some((item) => item.symbol === symbol),
    });
    const confirmed = await api.confirmListing(symbol);
    checks.push({
      operation: "confirmation",
      symbol,
      passed: confirmed.ok,
      ...(!confirmed.ok ? { reason: confirmed.reason } : {}),
    });
    if (confirmed.ok) {
      listings.push(confirmed.quote.listing);
      checks.push({
        operation: "regular_quote_metadata",
        symbol,
        passed: true,
        currency: confirmed.quote.listing.currency,
        exchange: confirmed.quote.listing.exchange,
        timezone: confirmed.quote.listing.timezone,
        marketAt: confirmed.quote.marketAt,
        fetchedAt: confirmed.quote.fetchedAt,
        marketState: confirmed.quote.marketState,
        delayMinutes: confirmed.quote.delayMinutes,
      });
    }
  }
  const batch = await api.fetchQuotes(listings);
  checks.push({
    operation: "batch",
    passed: listings.length === symbols.length && batch.ok && symbols.every((symbol) => batch.quotes[symbol]?.ok),
  });

  // Stall the actual SDK's fetch locally, proving the per-call signal reaches cookie/crumb HTTP work.
  // Public retrieval is exercised above; this check does not simulate an arbitrary remote timeout.
  let fetchStarted = false;
  let fetchAborted = false;
  const cancellationApi = createYahooMarketData({
    timeoutMs: 100,
    fetch: (_input, init) =>
      new Promise((_resolve, reject) => {
        fetchStarted = true;
        const signal = init?.signal;
        const aborted = () => {
          fetchAborted = true;
          reject(new Error("Controlled probe cancellation"));
        };
        if (signal?.aborted) aborted();
        else signal?.addEventListener("abort", aborted, { once: true });
      }),
  });
  const started = performance.now();
  const cancelled = await cancellationApi.confirmListing("AAPL");
  const elapsedMs = Math.round(performance.now() - started);
  checks.push({
    operation: "sdk_cancellation",
    passed: !cancelled.ok && cancelled.reason === "timeout" && fetchStarted && fetchAborted && elapsedMs < 5_500,
    elapsedMs,
  });

  const passed = checks.every((check) => check.passed);
  console.log(JSON.stringify({ provider: "yahoo", sdk: "4.0.5", runtime: process.version, passed, checks }, null, 2));
  if (!passed) process.exitCode = 1;
}
