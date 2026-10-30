# Yahoo provider validation — Phase 1

This phase establishes the provider contract. It adds no application route, listing UI,
schema, quote persistence or valuation integration. Subsequent phases remain gated on
local and controlled deployed evidence for both US and GPW retrieval and cancellation.

## Adapter contract

`src/lib/market-data/yahoo.ts` imports pinned `yahoo-finance2@4.0.5` on the server.
`createYahooMarketData()` provides:

- `searchListings(query, { signal? })`: bounded company/symbol search, returning at most
  ten deduplicated Yahoo stock/ETF candidates. Search does not establish currency.
- `confirmListing(symbol, { signal? })`: fetch and validate regular-session quote and
  confirmed listing identity before linking. Required metadata includes exchange,
  USD/PLN currency, an IANA timezone, and a usable nonfuture market timestamp.
- `fetchQuotes(listings, { signal? })`: one batch of up to fifty confirmed listings,
  returning outcomes keyed by symbol. Missing, invalid and changed-identity members do
  not discard valid members. The later orchestration layer owns multiple batches.

Each operation has a five-second maximum budget including SDK queue and cookie/crumb
setup. A caller signal may impose an earlier end-to-end deadline across operations.
The SDK receives a fresh abort signal on each operation; its default payload logging
and version-check requests are disabled. Safe failures expose a bounded reason and an
HTTP error status when available, without provider messages or payloads.

Quotes use `regularMarketPrice`/`regularMarketTime` even outside the regular session.
They carry actual market time, exchange-local calendar date, fetch time, market state
and optional source/delay metadata separately. A closed quote may be from the prior
session. Missing delay metadata is unknown, not zero delay.

Provider JS numbers are quantized from their shortest decimal representation to eight
fractional places with half-up rounding and checked against positive `numeric(20,8)`
range. Rounding to zero is invalid. This does not recover precision already lost by the
provider or SDK, and does not weaken the strict database decimal-text boundary.

The agreed product behaviors are recorded in PRD FR-006 and FR-013–FR-016: automatic
valuation from explicitly button-downloaded quotes, temporary manual override until a strictly later market quote,
single-currency wallets, safe reassignment and immutable future observations from cached
effective prices. These requirements are not implemented by the provider adapter.

The revised trigger policy permits quote downloads only after an explicit **Download
prices** click. Page reads use saved data. Listing setup's quote validation must also
follow that explicit action; confirmation must not issue another quote request.
The SDK probe remains an explicit developer command, separate from application triggers.

## Deterministic checks

The adjacent adapter tests inject provider fixtures rather than making live requests.
They cover regular/closed US/GPW quotes, exchange dates, identity/currency mismatch,
missing/malformed prices and timestamps, exact decimal normalization, partial/reordered
batches, safe failures, deadline enforcement and cancellation through the actual SDK's
fetch path. Repository type checking verifies the installed SDK signatures.

## Explicit local probe

With Node.js 24 and installed dependencies, run from the project root:

```sh
npm run probe:market-data -- --live
```

The fixed public fixtures are Apple (`AAPL`) and PKO Bank Polski (`PKO.WA`). The command
prints safe metadata and a boolean result; a failed check exits nonzero. It does not
read private holdings or require Supabase credentials. The cancellation subcheck injects
a stalled fetch into the actual installed SDK, then requires its fetch signal to abort
within the deadline. Public retrieval checks separately exercise Yahoo network access.

Record the Node version, command, execution time, pass/fail and safe metadata in the
phase verification receipt. Do not record raw SDK exceptions, cookies or response bodies.
Treat throttling, unavailable symbols, malformed required fields and blocked outbound
access as a failed gate. Do not replace the chosen provider without a new decision.

## Controlled Vercel probe

Use an isolated temporary preview fixture, outside the application source tree, with
Node 24, the pinned dependency and copies of the actual adapter/type files. It should
contain only a fixed public-symbol probe handler; it must not receive Supabase keys,
read user input, load diary data or create a production diagnostic route. Protect the
preview using the project's existing Deployment Protection; do not change protection
settings or promote it to production.

The handler must invoke the same search, confirmation, batch and controlled SDK-fetch
cancellation checks as the local script, with the same five-second operation bound.
Keep emitted metadata limited to the local probe's safe fields. Inspect the preview
runtime/build and exercise its fixed handler, recording the preview deployment identity
and pass/fail in the verification receipt. A local test alone cannot mark deployed access
as passed, and a successful deployed request alone cannot establish provider freshness
guarantees or complete GPW coverage.

Do not proceed to persistence or valuation phases unless the controlled preview proves
both symbols and cancellation. Preserve existing manual pricing while this gate is
unresolved. Archive/remove the temporary probe through the deployment workflow after
recording its evidence; do not commit an insecure diagnostic endpoint to the diary.

## Primary references

- [Pinned quote source](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/modules/quote.ts)
- [Pinned listing search](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/modules/search.ts)
- [Pinned SDK request options](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/docs/README.md)
- [Pinned fetch/crumb transport](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/lib/yahooFinanceFetch.ts)
