---
date: 2026-10-29T14:29:28+01:00
researcher: Codex
git_commit: 02070504db5a0618221352cdca229ffa1d6ae845
branch: prices-automated
repository: investments-diary
topic: "Free automatic stock prices for US and Polish holdings"
tags: [research, market-data, stock-prices, external-api]
status: partial
last_updated: 2026-10-30
last_updated_by: Codex
last_updated_note: "User revised download triggers to explicit Download prices clicks; earlier on-page-use recommendations below are superseded by the final revision note."
---

# Research: Free automatic stock prices

**Date:** 2026-10-29T14:29:28+01:00

**Researcher:** Codex

**Git Commit:** 02070504db5a0618221352cdca229ffa1d6ae845

**Branch:** prices-automated

**Repository:** investments-diary

## Research Question

Which free data sources are the best candidates for automatically displaying prices
for followed stocks, mostly US stocks but also Polish/GPW stocks, when a
15-minute delay is acceptable? What integration approach fits this application?

The change's original request is “as a User I want to automatically see price of
the followed stock actions” ([change.md](change.md)). Free access, US/Polish
coverage, and acceptance of delayed prices were clarified by the user in the
conversation. Provider selection and refresh behavior have not been approved.

## Summary

- **Yahoo Finance through `yahoo-finance2` is the leading feasibility candidate
  for a private diary.** Its JavaScript/TypeScript integration fits the inspected
  Node application without adding a Python runtime. It remains an unofficial
  integration with no availability or API-consistency guarantees [S1]. Warsaw
  delayed quotes are visible on Yahoo [S3], but exact holding coverage and
  freshness in the deployed application remain untested.
- **EODHD Free is the documented REST alternative for infrequent updates.** Its
  free-plan documentation lists worldwide exchanges, delayed data and personal
  use, with 20 API calls per day [S4]. Warsaw is a supported exchange [S7]. Its
  delayed-price documentation specifies 15–20 minutes for stocks [S6], which can
  exceed the user's stated acceptable delay. Exact GPW access under a free
  account remains a validation gap.
- **Stooq is a secondary candidate for historical imports or daily valuations.**
  Its free datasets cover US and Polish securities [S8, S9]. The reviewed pages
  do not establish a supported quote API with a freshness commitment matching
  the requested delay.
- **No candidate has been demonstrated here to satisfy the full requirement in
  deployment.** The comparison is documented; this artifact is marked partial
  because live coverage, access and freshness remain consequential unknowns.

## Detailed Findings

### Yahoo Finance via yahoo-finance2

Observed in the project's documentation [S1, S2]:

- The package provides quote retrieval, symbol search and TypeScript support.
- Its documented supported Node runtimes include the application's Node version
  declared in `package.json:5`.
- The maintainers describe it as unofficial and state that Yahoo does not
  guarantee service availability or API consistency.
- The request-handling documentation discusses throttling and temporarily being
  locked out. A lack of a published daily allowance is not unlimited access.
- The quote interface supports batching symbols; batching and caching can reduce
  request traffic without establishing a guaranteed quota.

Yahoo's GPW company page labels its Warsaw listing as a delayed quote [S3]. This
is evidence of Warsaw data availability on Yahoo, not proof that the package can
retrieve each intended holding from the deployed environment. Resolve and verify
provider symbols instead of assuming that app tickers map directly to Yahoo.

The Python `yfinance` project's usage guidance describes Yahoo data access as
intended for personal use and points readers to Yahoo's terms [S10]. Its open-source
license does not establish data redistribution rights. The recommendation assumes
private use; public or commercial display requires a separate rights assessment.

**Assessment:** Best first experiment for the existing application if unofficial
service dependencies and occasional stale quotes are acceptable. A strict
15-minute freshness guarantee has not been established. The earlier conversation's
Python recommendation is superseded by `yahoo-finance2` for this Node application;
the underlying Yahoo service limitations remain.

### EODHD Free

The provider's free-plan reference explicitly lists US/worldwide exchange access,
delayed prices, personal use and an allowance of 20 calls per day [S4]. Its pricing
page confirms that daily allowance [S5]. The provider's Warsaw page identifies the
exchange code as `WAR` [S7]. These documents make it a credible GPW candidate,
but a free-account request for the user's actual Polish holdings has not been made.

For stock snapshots, the delayed-price API describes a delay of 15–20 minutes and
returns a market timestamp. Its `close` field represents the latest delayed price,
rather than necessarily a completed daily closing price [S6]. The endpoint name
`/real-time/` must not be interpreted as evidence of real-time freshness.

The allowance is charged per symbol for live data [S5]. Under the explicit example
of 10 distinct holdings and one lookup per holding per refresh:

- Two refreshes consume 10 × 2 = 20 calls, exhausting the documented daily allowance.
- Refreshing at 15-minute intervals over a 6.5-hour US regular session means 26
  interval refreshes and 10 × 26 = 260 calls, excluding any additional opening
  refresh, retries or symbol discovery. This exceeds the documented free allowance.
- Combining symbols in one HTTP request does not eliminate the documented
  per-symbol accounting.

These are sizing examples, not the user's confirmed portfolio size or an approved
schedule. They show why EODHD Free suits occasional updates better than periodic
portfolio-wide polling.

**Assessment:** Prefer for a small personal portfolio refreshed infrequently when
an explicit REST interface matters. The daily quota and potential delay beyond
15 minutes prevent treating it as an established match for frequent updates.
The earlier emphasis on a paid subscription is superseded by the free-plan
documentation; the limited free allowance remains relevant.

### Stooq

Stooq's free data index lists Polish GPW and US securities [S8]. Its historical
downloads include daily and intraday datasets [S9]. Historical intraday files do
not establish a current-price service with a bounded delay.

The inspected Stooq pages [S8, S9] do not provide sufficient evidence for an
official, supported quote API, an automation quota or redistribution permissions
for the proposed application. Those are unresolved properties, not claims that
Stooq lacks such arrangements.

**Assessment:** Keep as a historical-data or daily-valuation candidate. Do not
select it for the requested delayed intraday behavior without further evidence.

### Previously considered option: Twelve Data

The exchange-specific Warsaw page lists EOD data [S11]. Therefore the earlier
general recommendation based on US coverage is superseded for the combined
US/GPW intraday requirement. End-of-day prices would weaken the stated freshness
requirement and need a separate product decision.

## Code References

The local inspection was limited to the following contracts and documents; it was
not an audit of the quote-to-valuation write path or deployment configuration.

- `package.json:5` — declared Node runtime.
- `package.json:33` — Astro, React, Vercel adapter and Supabase dependencies;
  `package.json:75` declares TypeScript.
- `context/foundation/tech-stack.md:24` — original private-diary intent;
  `context/foundation/tech-stack.md:34` describes Node on Vercel.
- `src/lib/validation/price.ts:11` — inspected manual-price schema validates
  `current_price` and a calendar `price_date`, with bounds relative to today and
  purchase date.
- `supabase/migrations/20261015094649_add_position_current_price.sql:12` — migration
  adds numeric price and date columns; `:16` adds paired-field and purchase-date
  constraints. This historical migration alone does not prove the final live schema.
- `context/foundation/lessons.md` — reviewed as known-pattern priors. Its migration
  guidance applies if a subsequent plan adds persistence; this research adds no schema.

## Architecture Insights

The following is a recommended direction for planning, not an approved implementation.

1. **Validate Yahoo in the deployment environment first.** Exercise the actual US
   and GPW holdings through `yahoo-finance2`, checking symbol identity, exchange,
   currency, quote timestamp, missing values and out-of-hours behavior. A local
   success does not establish deployed availability.
2. **Use a server-side provider boundary.** Normalize provider output into a quote
   containing instrument identity, price, currency, market timestamp, fetch timestamp
   and source. The rest of the application should not depend on Yahoo field names.
3. **Cache per instrument in Supabase.** A proposed 15-minute cache interval reduces
   repeated requests across positions and page loads; it does not guarantee that
   the underlying quote is within 15 minutes of the market. Quote age and cache age
   need separate treatment.
4. **Start with demand-driven refresh.** When a portfolio is opened, reuse a fresh
   cache entry or attempt a refresh. This meets automatic display while the user
   is viewing it; unattended snapshots or alerts would need a separate scheduling
   decision. Keep credentials on the server for providers that require them.
5. **Make stale and unavailable states explicit.** Retain the last successful quote
   with its market timestamp; label stale data and avoid representing fetch time
   as price time. Define timeouts, bounded retries and cooldown after throttling.
6. **Preserve manual-price intent.** Recommend separating fetched quote storage from
   manual entries. The inspected manual form uses a date rather than an intraday
   timestamp. Trace valuation, wallet snapshots and manual-write consumers before
   choosing quote precedence or changing those semantics.

The proposed initial provider is Yahoo. Keep EODHD as an alternative to evaluate,
not an automatic fallback on each failed Yahoo request: its free daily budget
could be consumed quickly. Manual entry plus the last successful quote is the
simpler initial degradation path.

## Historical Context

The archived `position-detail-and-price` change describes manual price entry and a
dated result ([change.md](../../archive/2026-10-15-position-detail-and-price/change.md)).
That description is supported by the currently inspected validator at
`src/lib/validation/price.ts:11`. Its migration describes per-position price/date
storage. Current result rendering, subsequent migrations and wallet snapshot
consumers were not traced for this provider comparison; no broader compatibility
claim is made.

## Related Research

No additional repository research was required to preserve the conversation's
provider comparison. A broader related-research search and implementation-path
audit are outside this saved output's scope.

## Sources

External evidence below was retrieved through Exa during the preceding conversation
on 2026-10-29. Provider plans and project documentation may change. Local references
describe inspected working-tree files and are not fabricated commit permalinks.

- **S1:** [yahoo-finance2 project documentation](https://github.com/gadicc/yahoo-finance2/) —
  supported runtimes, unofficial status, quote/search interface and TypeScript integration.
- **S2:** [yahoo-finance2 request handling](https://github.com/gadicc/yahoo-finance2/blob/dev/docs/concurrency.md) —
  batching, concurrency and rate-limit risks; this source follows a development branch.
- **S3:** [Yahoo Warsaw delayed quote example](https://finance.yahoo.com/quote/GPW.WA/) —
  Warsaw listing and delayed-data label; not used as a current numerical price.
- **S4:** [EODHD free-plan reference](https://github.com/eodhistoricaldata/eodhd-claude-skills/blob/main/skills/eodhd-api/references/subscriptions/free.md) —
  daily allowance, worldwide data access, delayed data and personal-use scope.
- **S5:** [EODHD pricing](https://eodhd.com/pricing) — daily allowance and per-symbol
  live-data accounting. Use the live pricing page to resolve future plan conflicts.
- **S6:** [EODHD delayed stock-price API](https://eodhd.com/financial-apis/live-ohlcv-stocks-api) —
  delay, snapshot fields, timestamps and batch interface.
- **S7:** [EODHD Warsaw exchange](https://eodhd.com/exchange/WAR) — Warsaw exchange identity.
- **S8:** [Stooq free data index](https://stooq.pl/db/) — US and Polish datasets.
- **S9:** [Stooq historical downloads](https://stooq.pl/db/h/) — daily and intraday files.
- **S10:** [yfinance usage guidance](https://github.com/ranaroussi/yfinance/blob/main/README.md) —
  personal-use guidance and distinction between package licensing and data rights.
- **S11:** [Twelve Data Warsaw coverage](https://twelvedata.com/exchanges/xwar) — EOD delay.

## Open Questions and Planning Handoff

Settled user constraints: free access, mostly US stocks plus Polish stocks, and
acceptance of a 15-minute delay. The original foundation document's private-diary
intent supports evaluating personal-use sources; future public distribution needs
separate confirmation of data rights.

Before implementation selection:

- Verify actual holdings and provider symbols, especially GPW coverage, currency
  and instrument identity. No live provider requests were performed in this research.
- Test Yahoo retrieval from the deployed environment and measure quote timestamps.
  Determine whether “15 minutes is OK” is a strict maximum delay or a preference
  compatible with occasional stale data and EODHD's documented wider delay range.
- Confirm free-account GPW access for EODHD if it remains under consideration.
- Establish portfolio size and refresh expectations before budgeting API requests.
- Decide whether automatic prices are display suggestions or also inputs to stored
  results and wallet snapshots; define manual override and stale-data precedence.
- Inspect current symbol storage, price consumers, schema migrations, authorization
  and background-job arrangements before selecting affected files for a plan.

The candidate comparison is ready for planning, but provider feasibility remains
partial. Saving this document does not approve a provider, schema, plan or implementation.

## Follow-up: Placement, Download Approach and Refresh Frequency

**Date:** 2026-10-29. **Evidence revision:** the repository commit and branch in
the frontmatter remain unchanged. Codex inspected local code for this follow-up;
the external provider sources above were discovered with Exa. Position-flow and
wallet/snapshot investigations were delegated read-only and both completed.

### Answer and proposed scope

Put provider communication in `src/lib/market-data/`, database access and refresh
orchestration in `src/lib/services/market-prices.ts`, and presentation alongside
the existing position components. These are proposed paths, consistent with the
repository's service/DTO conventions in `CLAUDE.md:126`.

**Recommended initial download strategy:** server-side batched HTTP quote requests,
triggered when the user opens a relevant page, with a proposed 15-minute successful
fetch cache interval per mapped instrument and account. This interval is a design
recommendation for a private diary, not a provider guarantee or an approved setting.
No provider request is needed when a reusable cache entry exists. Do not introduce
a streaming connection, separate Python service, or continuous unattended poller
for the initial display use case.

The earlier generic recommendation to share effective prices across views is now
conditional: using automatic quotes in existing results also affects SQL snapshot
semantics and currency assumptions. Showing a distinct market quote first is the
smallest compatible scope; replacing valuation inputs requires an explicit product
decision. The user has requested research, not approved either scope.

### Current extension points and constraints

- **Instrument identity:** `src/lib/validation/position.ts:72` accepts a trimmed
  instrument label; `src/lib/services/positions.ts:262` stores that label. The
  inspected core schema at
  `supabase/migrations/20260929141102_create_diary_core.sql:27` and DTOs at
  `src/types.ts:60` do not define a provider symbol, exchange or currency. A label
  such as “Apple” is not a confirmed listing. Add explicit provider mapping while
  retaining the label and allowing unmapped/manual positions.
- **Manual-price contract:** `src/lib/services/positions.ts:127` writes
  `current_price` and `price_date` for a matching non-deleted open position.
  `src/pages/dashboard/positions/[id].astro:88` invokes it after form validation.
  Keep this manual write separate from quote-cache writes; a provider download
  should not silently replace the recorded manual pair.
- **Natural UI location:** the open position's current-price section begins at
  `src/pages/dashboard/positions/[id].astro:206`. Place mapping controls and source,
  currency, quote-time and unavailable/stale display there; the dashboard table
  can show the same quote presentation compactly. No standalone quotes screen is
  required for the initial followed-holdings use case.
- **Read composition:** position list, confrontation and detail reads live at
  `src/lib/services/positions.ts:66`, `:91` and `:110`. Dashboard loading begins at
  `src/pages/dashboard.astro:29`; confrontation loading is at
  `src/pages/dashboard/new.astro:93`. These are integration boundaries for a quote
  service, rather than reasons to put provider calls inside presentation components.
- **Shared results:** `src/components/positions/PositionsTable.astro:67` uses
  `PositionResult`, and `src/components/positions/ConfrontationPanel.tsx:50` uses
  `describeResult`. `src/lib/result.ts:27` selects sale price/date for closed
  positions. Provider I/O should stay outside these pure result helpers. If the
  product selects automatic valuation, feed consistently selected effective values
  into the result surfaces; closed positions must retain sale-based results.
- **Wallet reads differ:** `src/lib/services/wallets.ts:55` selects valuation fields
  without instrument identity. Wallet summaries load through this path at
  `src/pages/dashboard/wallets/index.astro:16`, while wallet detail uses position
  reads at `src/pages/dashboard/wallets/[id].astro:80`. A detail-page overlay does
  not update the summary path automatically.
- **Authorization:** `src/middleware.ts:7` protects the `/dashboard` prefix;
  `src/lib/supabase.ts:13` creates the cookie-backed client. For a new `/api/`
  endpoint, add explicit authentication and ownership checks before provider work.
  Prefer a dashboard-scoped endpoint for this feature, with owned position IDs as
  inputs and server-resolved mappings rather than arbitrary provider URLs.
- **Decimal boundary:** `src/lib/services/decimal.ts:4` decodes database prices as
  decimal text; `src/lib/decimal.ts:45` rejects numeric JSON at that boundary.
  Normalize provider values separately, with explicit finite/positive checks,
  supported precision/range and rounding policy. Converting a provider JavaScript
  number to text does not recover any precision already lost upstream.
- **Diagnostics:** use `src/lib/observability/reporter.ts:12` and `:34` to preserve
  causes and report unexpected failures. Register new operation/route names in
  `src/lib/observability/privacy.ts:3` and `:59`; otherwise unrecognized operation
  labels normalize to `unexpected` at `:82`. Avoid raw holdings/provider payloads
  and credentials in logs. A quote failure is not an empty diary.

### Proposed file structure

These paths describe a planning recommendation; the research creates none of them.
Shared domain DTOs belong in the existing `src/types.ts`; provider-private response
types can remain beside the adapter.

```text
src/
  lib/
    market-data/
      yahoo.ts                    # server-side provider adapter and normalization
      yahoo.test.ts               # mocked payload/currency/timestamp/precision cases
      refresh-policy.ts           # pure cache expiry, eligibility and cooldown decisions
      refresh-policy.test.ts
    services/
      market-prices.ts            # mapping/cache access, batch refresh and partial outcomes
      market-prices.test.ts
    validation/
      market-instrument.ts        # confirmed listing-link input validation
  components/
    positions/
      MarketPrice.astro           # source, currency, market time and quote state
      MarketInstrumentForm.astro  # explicit mapping; React only if interactive search is chosen
  pages/
    dashboard/
      market-prices/
        refresh.ts               # optional authenticated POST for refresh/progressive loading
      positions/
        [id]/
          market-instrument.ts   # optional mapping POST, ownership checked
  types.ts                       # extend with mapping, normalized quote and view DTOs
supabase/
  migrations/
    <timestamp>_market_prices.sql # mapping metadata, quote cache, constraints and RLS
```

For the minimum persistence shape, consider nullable confirmed mapping metadata on
positions and a separate owner-scoped quote cache keyed by provider, symbol,
exchange and quote currency. Deduplicate across the owner's positions using this
identity. Keep cache data distinct from `positions.current_price`/`price_date`.
Every new table needs operation-specific RLS under `CLAUDE.md:16`; owner-scoped
cache rows avoid introducing a globally client-writable quote cache. A cross-account
shared cache would need a separate trusted-writer design.

The cache needs successful quote data plus refresh-attempt/cooldown metadata.
Use an atomic database claim or short lease to prevent concurrent requests from
downloading the same expired instrument. Record failures without deleting the
last valid quote; reject out-of-order replacement by an older provider quote.
An in-memory map can optimize a request but is not sufficient persistent cache
coordination for the serverless deployment declared in `astro.config.mjs:54` and `:94`.

Regenerate `src/db/database.types.ts` after migrations and extend decimal write
overrides in `src/db/api.types.ts:17` for any new numeric columns. Add view fields
and data composition at the selected page/service boundaries. Keep the provider
adapter server-imported; browser components receive normalized data, not the SDK.

Conditional additions, rather than initial requirements:

- `src/lib/market-data/effective-price.ts` and tests if automatic/manual precedence
  becomes an application policy. If SQL capture uses the same effective values,
  prefer an explicit database view/function contract consumed by both paths over
  unrelated precedence rules in page code and capture SQL.
- A focused browser refresh controller if quotes must change while a page remains
  open. Use it with the authenticated refresh route, batch the page's instruments
  and update quote state without reloading an in-progress manual form.
- A versioned scheduled-sync mechanism if prices must refresh while the diary is
  unused. A manual configuration/verification helper belongs under
  `scripts/automation/`, following `scripts/README.md:61`.

### Download flow and frequency

The following proposed policy applies to mapped, open, non-deleted holdings; the
existing manual update's active-state filters at `src/lib/services/positions.ts:134`
provide the behavior to preserve, alongside owner RLS. Closed holdings remain
visible but do not need new quotes for their realised result.

1. Load the authenticated user's eligible holdings and resolve their confirmed
   listing identities on the server. Reuse a quote across that user's positions
   for the same listing, instead of issuing a request per position.
2. Read cached quotes in a batch. **On page open, request missing quotes and quotes
   whose last successful fetch is at least the proposed 15 minutes old**, subject
   to the attempt cooldown and concurrent-refresh claim. A manual refresh uses
   the same rate guard rather than bypassing it.
3. Download eligible symbols through the provider's batch quote interface [S1, S2].
   Use bounded batch size, concurrency and an end-to-end request budget selected
   after the deployment feasibility check. This is snapshot polling, not a
   historical-data download or streaming feed.
4. Await bounded refresh work within the request, or use an explicit client-triggered
   progressive request after rendering saved data. Do not launch unawaited promises
   after returning the serverless response. Missing provider data must not prevent
   viewing the diary or saving an investment.
5. On provider error, retain the previous quote and record failure/cooldown. For the
   initial policy, wait until at least the next proposed 15-minute attempt window
   before retrying a failed listing, or longer if the provider supplies a retry
   delay. Further page loads should not create an immediate retry loop.
6. Store `market_at` separately from `fetched_at` and show the actual quote time.
   Refreshing a cache does not prove that the quote advanced. Treat a last-session
   quote as a dated closed-market quote when verified market status is available;
   do not invent exchange opening times from the application's local timezone.
7. **Without an active-page controller, quotes refresh on navigation/reload, not
   automatically inside an already-open page.** If that behavior is required, a
   proposed visible-page check every 15 minutes may call the same guarded service;
   pause it in hidden tabs and recheck expiry on focus. This remains a choice for
   planning, not implemented behavior.

For Yahoo, this policy reduces request traffic but cannot establish a quota or a
maximum market delay [S1, S2]. The cache interval and provider delay accumulate:
reusing a cached delayed quote makes it older than a newly fetched delayed quote.
The user's acceptance of delayed data must not be presented as a demonstrated
15-minute end-to-end freshness guarantee.

For EODHD Free, use the earlier per-symbol budget calculation instead of enabling
this interval indiscriminately. Under its documented 20-call daily allowance [S4,
S5], the example portfolio above cannot sustain repeated intraday refreshes. A
daily-budget gate and much less frequent updates would be necessary.

**Initial unattended frequency recommendation: none.** Fetch when the diary is
used. If later requirements demand unattended observations using market prices,
define a scheduled sync tied to that observation purpose rather than running an
unconditional market-data loop around the clock.

### Wallet history is a separate contract

`src/lib/wallet.ts:44` uses `positionResult` to compute live totals. In contrast,
`supabase/migrations/20261028160000_wallet_snapshots.sql:30` captures observations
directly in SQL from saved position prices at `:36`. Its conflict handling at
`:58` preserves an existing observation for a wallet/day. The versioned job at
`supabase/migrations/20261028170000_register_daily_wallet_snapshot_job.sql:14`
calls that SQL at midnight UTC; it does not call Node or a quote adapter. This
describes repository wiring, not a verified production job state.

Consequences for the two product choices:

- **Distinct market-quote display:** keep recorded diary results and saved history
  based on manual prices, label the fetched quote separately, and avoid suggesting
  that wallet totals already include it. This follows the present manual-observation
  contract in `context/foundation/prd.md:157`.
- **Automatic prices drive valuations:** align position, confrontation, wallet
  summary/detail and SQL capture on the selected effective-price rule. A cache
  populated only on page access may be old or absent at midnight when the user
  has not opened the diary. If recently fetched observations are required, add
  a scheduled quote-sync worker, defined completion ordering and stale-data
  behavior before capture. Retain existing immutable observations.

The currently inspected PRD deliberately excludes a live source at `:210` and
currency handling at `:212`. The new request authorizes research into that later
feature; it does not settle valuation precedence or currency conversion. Because
USD and PLN quotes have different units, automatic valuation needs confirmed
buy-price/quote currency compatibility and wallet denomination or grouping rules.
Recording quote currency alone does not make a mixed-currency wallet total valid.

### Follow-up coverage, superseded gaps and planning decisions

This follow-up answers the earlier request to inspect placement, symbol storage,
manual-price consumers, wallet capture, route authentication and download scheduling.
The earlier statements that these paths had not been traced describe the initial
comparison; they are superseded by this bounded inspection. Provider feasibility,
live deployment behavior and free-account GPW requests remain unverified, so the
overall research status remains partial.

Before an implementation plan is finalized, settle:

- Whether the first release displays distinct automatic quotes or uses them for
  existing results and wallet observations.
- How the user confirms listing identity and currency for existing free-text
  holdings, and how manual override interacts with automatic selection.
- Whether updating on navigation is sufficient, or a visible open page also needs
  periodic updates; whether unattended snapshot freshness is required.
- The accepted stale-data behavior and provider feasibility results, including
  an explicit decision if delayed feed plus cache age exceeds the preferred delay.

Recommended future verification targets are provider normalization, cache expiry
and cooldown, duplicate/concurrent refreshes, out-of-order quotes, per-listing
partial failure, ownership isolation and closed/deleted eligibility. If valuation
changes, extend result-surface, decimal transport and snapshot parity coverage.
This research ran no builds, tests, migrations or provider requests and changed
no application behavior.

## User revision — 2026-10-30: Explicit downloads

The user replaced the proposed page-use refresh policy with **Download prices**
button clicks. Earlier on-navigation/15-minute successful-fetch recommendations
in this research are historical and superseded by the updated plan and PRD.

Page reads, reloads, timers and snapshot capture consume saved values without quote
downloads. Each explicit download may fetch newer prices regardless of the age of
the previous successful download. In-flight coordination and the existing failed-attempt
cooldown remain; expiry does not cause an automatic retry. Listing setup's quote
lookup also requires this explicit button action; confirmation reuses its validated
result. Search may request listing metadata without fetching valuation quotes.
