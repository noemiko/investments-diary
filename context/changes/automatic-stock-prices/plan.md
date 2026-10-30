# Automatic stock prices — Implementation plan

## Overview

Introduce downloaded market quotes as valuation inputs while retaining manual entries separately. Download prices only after an explicit click on **Download prices**. Use database-defined price selection so application views and daily observations agree.

## Current State Analysis

- Position services load decimal values as text and enforce owner access through the request-scoped client.
- Manual-price updates target open, non-deleted positions.
- Daily snapshot capture independently reads position prices in SQL.
- Legacy wallets may contain holdings in different currencies.
- Existing listing labels cannot reliably identify a company, exchange, and currency.

## Desired End State

A confirmed listing supplies prices to open-position calculations after the user clicks **Download prices**. Opening or reloading a page displays saved values without downloading quotes. Manual and provider sources remain distinguishable. Closed positions use their recorded sale values. Future observations preserve the effective values available when captured.

### Key Discoveries

- [Position services](../../../src/lib/services/positions.ts) already separate manual-price writes from other position actions.
- [Snapshot capture](../../../supabase/migrations/20261028160000_wallet_snapshots.sql) bypasses TypeScript, requiring a shared database selection contract.
- Yahoo batch results can omit symbols; responses must be matched by symbol rather than array position.

## What We’re NOT Doing

No FX conversion, streaming connections, page-load or reload downloads, periodic browser refresh, unattended provider job, automatic retries, automatic ticker guessing, historical backfill, or changes to recorded reasoning.

## Implementation Approach

Keep provider I/O in a server-only market-data module and orchestration in a service called by an authenticated **Download prices** POST action. Page reads and snapshot capture use saved quotes without provider calls. Store quotes separately from manual prices. Add a security-invoker database view that exposes selected valuation inputs to existing application reads and snapshot capture.

## Phase 1: Provider validation and agreed contracts

### Overview

Validate the external dependency before changing valuation behavior.

### Changes Required

**Files:** package manifest/lockfile, server-only provider adapter, feature documentation.

**Intent:** Establish that Yahoo can support the agreed US/Polish use case in the actual runtime.

**Contract:**

- Pin `yahoo-finance2@4.0.5`.
- Validate search, listing confirmation, batch quotes, and cancellation locally and in a controlled Vercel environment using public test symbols.
- Require usable price, currency, exchange identity, timezone, and market timestamp.
- Use regular-session prices; expose delayed/closed-market context.
- Stop subsequent phases if deployed US/GPW retrieval or cancellation fails. Do not substitute another provider silently.
- Update PRD requirements to include the agreed automatic-pricing, currency, reassignment, and future-observation behavior.

### Success Criteria

#### Automated Verification

- Adapter contract tests pass with valid, missing, malformed, and partial provider fixtures.
- Type checking confirms the pinned SDK integrates with the Node application.

#### Manual Verification

- Local and deployed probes demonstrate US/GPW search, confirmation, quotes, and bounded cancellation.

## Phase 2: Persistence and shared price selection

### Overview

Create one valuation contract without overwriting manual inputs.

### Changes Required

**Files:** new database migrations, generated database types, shared DTOs and decimal transport overrides; minimal wallet currency form, validation, service writes and affected fixtures.

**Intent:** Persist listing identity, quote state, currency, and override timing safely.

**Contract:**

- Add nullable legacy wallet currency; new wallets require USD, PLN, EUR. Confirmation explicitly covers starting value and recorded prices. Freeze confirmed currency.
- Bring the minimal wallet currency input, validation and service write forward from Phase 4 so strict new-wallet requirements work immediately; preserve submitted form values on validation failure. This sequencing adjustment was approved on 2026-10-30.
- Add confirmed listing metadata to positions, retaining the original diary label. Linking requires quote currency to match wallet currency.
- Add an owner-scoped quote cache keyed by provider and confirmed listing identity. Store decimal price, market timestamp/date, fetch time, refresh outcome, cooldown, and refresh lease.
- Enable operation-specific RLS. Ordinary requests continue using the owner’s authenticated client.
- Add database-stamped manual-save time. Stamp each explicit manual-price save, including identical resubmissions; leave historical save times unknown.
- Add a security-invoker effective-price view with explicit selected price, date, timestamp, source, and quote state.
- Selection order: closed sale; temporary manual correction while the cached market timestamp is equal to or earlier than its save time; valid automatic quote; saved manual fallback; otherwise missing price.
- Unmapped positions remain manual. Failed refreshes do not discard a valid cached quote.
- Maintain decimal-text transport and existing exact arithmetic.

### Success Criteria

#### Automated Verification

- Migration and database tests prove owner isolation, currency compatibility, and strict manual-override timing.
- Cache tests prove exclusive refresh claims, expired-lease recovery, and rejection of older quote replacements.

#### Manual Verification

- Legacy data remains unchanged and unconfirmed until the owner explicitly assigns currency.

## Phase 3: Downloads, cache orchestration, and listing search

### Overview

Fetch quotes within bounded requests and provide confirmed listing selection.

### Changes Required

**Files:** proposed server-side market-data adapter, refresh-policy module, service, and authenticated dashboard endpoints.

**Intent:** Keep provider failures contained while limiting free-source traffic.

**Contract:**

- Download quotes only through an authenticated POST initiated by an explicit **Download prices** button click. GET page loads, reloads, navigation, focus changes, timers and snapshot capture must not fetch quotes.
- Each click requests the latest prices for the selected owned, mapped, open, non-deleted holdings, regardless of the age of a previously successful download. Remove the former 15-minute successful-fetch eligibility rule; saved quotes remain available until another explicit download.
- Deduplicate by owned listing identity and use batches of up to 50 symbols.
- Use a five-second provider budget for the refresh operation, sequential batches, and a fresh abort signal per operation. Unattempted symbols remain due.
- Claim refresh work atomically. Use a 30-second lease and a 15-minute failed-attempt cooldown; honor longer provider retry delays.
- Retain successful batch members when others are missing or invalid. Match results by returned symbol.
- Normalize finite positive provider numbers to decimal text, quantized to eight fractional places with explicit half-up rounding; reject values outside the existing price range.
- Separate market time from fetch time. Re-fetching the same market quote does not advance its market timestamp.
- Search accepts a bounded query, returns at most ten supported stock/ETF listings, and requests no news.
- During listing setup, require an explicit **Download prices** click for the candidate's quote lookup before showing exchange, currency and timezone for confirmation. Confirming that returned listing reuses server-validated lookup data without a second provider request. Searching may retrieve listing metadata on explicit search submission, but must not download quotes or update valuation data. Do not trust browser-supplied listing metadata.
- Authenticate before provider work; verify ownership and same-origin mutation requests.
- Report sanitized failures through the existing observability boundary.

### Success Criteria

#### Automated Verification

- Service tests prove batching, deduplication, deadlines, cooldown, partial results, and retained-cache behavior.
- Endpoint tests reject unauthenticated, foreign-position, incompatible-currency, and malformed requests.
- Trigger tests prove quote downloads require the button POST and never run on page reads, reloads, listing confirmation, timers or snapshot capture.

#### Manual Verification

- Listing search distinguishes exchange/currency choices and provides a recoverable unavailable state.

## Phase 4: Application integration and future observations

### Overview

Use the shared values throughout the diary and support legacy wallet separation.

### Changes Required

**Files:** position/wallet services and pages, listing-search island, result components, snapshot capture and timeline.

**Intent:** Make automatic pricing useful without inconsistent calculations or historical rewrites.

**Contract:**

- Compose effective values into position list/detail, confrontation, wallet summary, and wallet detail reads. Keep arithmetic helpers free of I/O.
- Link holdings from position detail through search and confirmation. New/unlinked holdings remain usable manually.
- Add **Download prices** on the positions dashboard for the owner's mapped open holdings and in listing setup for the selected candidate. Show an in-progress state, prevent duplicate submissions, and report per-listing success/failure and any retry cooldown. No click means no new quote download, including when saved data is old or missing.
- Show selected source, currency, actual market time, temporary override, and failed-refresh state.
- Preserve existing manual forms. A correction stays effective until a provider market timestamp is **strictly later** than its database save timestamp.
- Include moving non-deleted open or closed positions between owned wallets. Preserve position facts and past observations; affect current/future wallet totals.
- Require a confirmed target currency. Reject moves between conflicting confirmed denominations. Moving from an unconfirmed legacy wallet requires explicit confirmation that recorded amounts use the target currency.
- Replace snapshot capture’s raw-price selection with the shared view. Keep its midnight UTC schedule, idempotency, restricted execution, and immutable observations.
- New observations record currency, selected manual/automatic coverage, and automatic quote-time context.
- Preserve legacy observations with unspecified currency. Display them separately from the denominated chart rather than implying confirmed currency retroactively.
- No provider downloads occur during snapshot capture or while the app is unused.

### Success Criteria

#### Automated Verification

- Cross-surface and database tests prove effective-price parity, reassignment boundaries, and unchanged historical observations.
- Snapshot tests prove future observations use cached effective values with correct currency and source coverage.

#### Manual Verification

- Search, linking, correction, reassignment, outage display, and wallet history work through the UI without losing form input.

## Phase 5: Verification and release preparation

### Overview

Verify the feature against local fixtures and the deployment runtime.

### Changes Required

**Files:** focused service/database/browser tests and operational documentation.

**Intent:** Prove the financial and access contracts before release.

**Contract:**

- Keep CI deterministic using provider fixtures; live Yahoo probes are explicit checks.
- Run repository verification in order: Astro sync, lint, Astro check, build, and unit tests.
- Run local decimal transport, snapshot database, cron, and smoke checks appropriate to the changed paths.
- Document provider failures, cache inspection, currency migration, and manual fallback.
- Deploy migrations before the application that consumes them. Roll back application behavior without dropping stored data or rewriting observations.
- Preserve the existing capture function signature so rollback can restore its manual selection body through a new migration if needed.

### Success Criteria

#### Automated Verification

- Repository static/unit checks and affected local database checks pass.
- Regression scenarios cover ownership, decimal precision, manual boundaries, currency, reassignment, and snapshot immutability.

#### Manual Verification

- Deployed behavior passes the US/GPW walkthrough and rollback procedure is reviewable.

## Testing Strategy

Focus on user-visible failure modes: equal versus later timestamps, identical manual resaves, provider timeouts, omitted batch symbols, stale retained prices, incompatible currencies, foreign ownership, concurrent refreshes, closed/deleted holdings, and unchanged prior snapshots.

For snapshot parity, compare application valuation and SQL capture against the same fixed cache state. Do not expect identical totals across different market-data states.

## Performance Considerations

There is no automatic download interval. The user controls downloads through **Download prices**, and each click can request newer prices even after a recent successful download. In-flight deduplication, the 30-second refresh lease, the 15-minute failed-attempt cooldown and longer provider retry delays still apply; cooldown expiry never triggers a request by itself. The provider budget bounds button-request latency. Navigation and investment-save POSTs use saved quotes without provider calls.

## Migration Notes

Use additive migrations. Do not guess currencies, listing identities, or historical manual-save times. Keep existing numerical observations intact. Mixed legacy holdings must be reassigned before their wallets can truthfully be confirmed as single-currency wallets.

## References

- [Research and code map](research.md)
- [Existing position services](../../../src/lib/services/positions.ts)
- [Existing snapshot capture](../../../supabase/migrations/20261028160000_wallet_snapshots.sql)
- [Tagged Yahoo quote implementation](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/modules/quote.ts)
- [Tagged Yahoo search implementation](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/modules/search.ts)
- [Tagged SDK request options](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/docs/README.md)

## Progress

### Phase 1: Provider validation and agreed contracts

#### Automated

- [x] 1.1 Adapter contract tests pass with valid, missing, malformed, and partial provider fixtures. — `827fbc0`
- [x] 1.2 Type checking confirms the pinned SDK integrates with the Node application. — `827fbc0`

#### Manual

- [x] 1.3 Local and deployed probes demonstrate US/GPW search, confirmation, quotes, and bounded cancellation. — `827fbc0`

### Phase 2: Persistence and shared price selection

#### Automated

- [x] 2.1 Migration and database tests prove owner isolation, currency compatibility, and strict manual-override timing. — `b83a91d`
- [x] 2.2 Cache tests prove exclusive refresh claims, expired-lease recovery, and rejection of older quote replacements. — `b83a91d`

#### Manual

- [x] 2.3 Legacy data remains unchanged and unconfirmed until the owner explicitly assigns currency. — `b83a91d`

### Phase 3: Downloads, cache orchestration, and listing search

#### Automated

- [x] 3.1 Service tests prove batching, deduplication, deadlines, cooldown, partial results, and retained-cache behavior.
- [x] 3.2 Endpoint tests reject unauthenticated, foreign-position, incompatible-currency, and malformed requests.
- [x] 3.4 Trigger tests prove quote downloads require the button POST and never run on page reads, reloads, listing confirmation, timers or snapshot capture.

#### Manual

- [x] 3.3 Listing search distinguishes exchange/currency choices and provides a recoverable unavailable state.

### Phase 4: Application integration and future observations

#### Automated

- [ ] 4.1 Cross-surface and database tests prove effective-price parity, reassignment boundaries, and unchanged historical observations.
- [ ] 4.2 Snapshot tests prove future observations use cached effective values with correct currency and source coverage.

#### Manual

- [ ] 4.3 Search, linking, correction, reassignment, outage display, and wallet history work through the UI without losing form input.

### Phase 5: Verification and release preparation

#### Automated

- [ ] 5.1 Repository static/unit checks and affected local database checks pass.
- [ ] 5.2 Regression scenarios cover ownership, decimal precision, manual boundaries, currency, reassignment, and snapshot immutability.

#### Manual

- [ ] 5.3 Deployed behavior passes the US/GPW walkthrough and rollback procedure is reviewable.
