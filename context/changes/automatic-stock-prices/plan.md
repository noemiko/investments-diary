# Automatic stock prices — Implementation plan

## Overview

Introduce downloaded market quotes as valuation inputs while retaining manual entries separately. Download prices only after an explicit click on **Download prices**. Use database-defined price selection so application views and daily observations agree.

## Approved currency simplification — 2026-10-30

The owner replaced deferred legacy currency confirmation during Phase 4 manual verification:

- Assign USD to every wallet whose currency is unset; all wallets have a denomination thereafter.
- Retain ordinary USD/PLN/EUR selection for new wallets and the frozen-currency/no-FX rule.
- Remove currency attestation, deferred confirmation, unconfirmed-wallet UI and legacy move branches.
- Give every observation with unset currency its wallet’s denomination, then remove the separate legacy-history UI. Preserve every recorded numeric amount, date and result; this is a denomination metadata update, not conversion or recalculation.
- Do not invent missing historical source coverage or manual-save timestamps.

These decisions supersede the earlier nullable-wallet/attestation and unspecified-history requirements below. Completed Phase 2/3 Progress rows record the checks performed for those earlier commits; Phase 4 verification must cover the revised policy before completion.

## Approved creation-flow revision — 2026-10-30

The owner requires choosing a matching Yahoo stock/ETF while creating an investment, rather than saving a free-text instrument and discovering linking later. The owner explicitly chose **select and save first; download prices later from the dashboard**.

- Require a server-validated provider search selection for every newly created investment. Do not accept a typed name or browser-supplied listing metadata as verification.
- Keep selected search metadata separate from the fully verified quote-cache identity: Yahoo search does not establish trading currency or exchange timezone. Do not guess either value.
- Search and select explicitly; saving, navigation and page reads perform no quote request. The first explicit **Download prices** verifies the selected identity, currency and timezone before applying a price.
- Include selected open holdings in dashboard download eligibility even before their first quote. Show their selected company/symbol/exchange and first-download state without claiming verified quote metadata.
- Preserve native form submission and entered values through search, selection, validation errors and provider outages. Show wallet denominations so the author can choose the intended trading currency. Reject incompatible downloaded currency without conversion or valuation contamination.
- Existing positions retain labels and manual support. They do not acquire guessed selections or become invalid when edited, moved, closed or restored.

This supersedes the Phase 4 allowance for newly created unlinked holdings. Existing-position quote confirmation remains supported. Phase 4 automated rows are reopened for the revised creation/download flow; the previous checks remain historical evidence, not proof of this new behavior.

## Approved release revision — 2026-11-02

Phase 5 preflight found that the original release contract could not be executed as written. The owner approved:

- **Recovery contract:** schema-compatible recovery replaces only the four `selected_*` outputs of `position_effective_prices` through a new reviewed additive migration copied from the operator template. `capture_wallet_snapshots()` stays unchanged and consumes the same view. This supersedes the earlier "restore a manual capture body" rollback.
- **No pre-feature rollback target:** `20261030140619_set_wallet_denominations.sql` removes contracts used by older builds, so the release uses a schema-first maintenance transition. No previous production deployment is a valid post-migration rollback.
- **Deployed acceptance on production:** there is no Preview database (Supabase variables are Production-scoped). Phase 5 ends at local release readiness plus owner review of the runbook. A new Phase 6 holds the human-run production release and the AAPL/PKO.WA walkthrough.

Progress row 5.3 is reworded in place (it was unchecked); the deployed walkthrough moves to Phase 6. Follow-up on the same date: Phase 5 adds an owner-run hosted migration dry-run review (row 5.5), and post-migration production checks (6.1) are owner-run rather than agent-run.

**Required stock selection — 2026-11-02.** All production investments are draft data. The owner made the stock selection (`positions.market_target_id`) required at the database level and assigned Apple Inc. (Yahoo `AAPL`, `NMS`, `EQUITY`) to every existing investment in every account, including closed, deleted and PLN/EUR-wallet holdings. This is an explicit owner assignment, not automatic ticker guessing. It uses the pending-selection path, so no currency, timezone or quote is written by hand, and the first explicit **Download prices** verifies the listing. PLN/EUR-wallet Apple holdings will report `incompatible_currency` until they are deleted and recreated. The confirmed listing (`market_listing_id`) stays nullable. Existing-position listing confirmation is retired from the UI and API, so each holding has one stock identity. This supersedes the earlier owner-run bulk-assignment design from the same date.

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

No FX conversion, streaming connections, page-load or reload downloads, periodic browser refresh, unattended provider job, automatic retries, automatic ticker guessing, historical backfill, or changes to recorded reasoning, changing a saved stock selection, or confirming a different listing for an existing holding.

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

Use the shared values throughout the diary, with matching-currency wallet moves and unified history.

### Changes Required

**Files:** position/wallet services and pages, new-investment form and validation, listing-search controls, additive selection migrations and generated types, result components, snapshot capture and timeline.

**Intent:** Make automatic pricing useful without inconsistent calculations or historical rewrites.

**Contract:**

- Compose effective values into position list/detail, confrontation, wallet summary, and wallet detail reads. Keep arithmetic helpers free of I/O.
- Require choosing a provider stock/ETF from search on the new-investment form before saving. Persist an owner/wallet-bound server selection, retain fields on failures and keep the native form path. New selections have no fabricated currency/timezone or market quote.
- Keep durable owner-scoped pending targets, unique by provider/symbol/exchange/instrument type, separate from expiring owner/wallet-bound search-choice receipts. A saved position references its durable target; receipt expiry affects unsaved forms only. Enable granular per-operation RLS and preserve the existing verified-cache schema.
- Native search/select/save POST actions retain all entry fields. Save validates the stored receipt before category creation or position insertion and derives the instrument label from stored provider metadata; missing, foreign, expired or wallet-mismatched receipts are recoverable errors. Wallet changes invalidate selection rather than rebinding it.
- Resolve the selected listing and validate its identity and wallet currency on the first explicit dashboard download, then attach the verified canonical cache identity. Preserve bounded requests, deduplication, leases, failure cooldowns and retained values. A failed first download leaves the selection and manual forms recoverable.
- Deduplicate pending targets across owned open holdings under the same five-second provider budget. Claim each target's refresh lease; claim an existing canonical cache lease before fetching when identity is already known. Reuse each in-click provider outcome across pending and mapped holdings. The initial unknown-identity lookup is protected by the target lease. Attach verified prices only to compatible owned wallets; incompatible holdings retain their selection and manual values with an explicit error.
- Continue linking existing unlinked holdings from position detail through explicit quote download and confirmation. Existing holdings remain usable manually.
- Make linking discoverable through a direct **Link stock listing** action beside unlinked open investments. Seed a recognizable linked US stock in the local demo without provider calls; reruns preserve existing edits and selected listings.
- Add **Download prices** on the positions dashboard for the owner's mapped open holdings and in listing setup for the selected candidate. Show an in-progress state, prevent duplicate submissions, and report per-listing success/failure and any retry cooldown. No click means no new quote download, including when saved data is old or missing.
- Show selected source, currency, actual market time, temporary override, and failed-refresh state.
- Preserve existing manual forms. A correction stays effective until a provider market timestamp is **strictly later** than its database save timestamp.
- Include moving non-deleted open or closed positions between owned wallets. Preserve position facts and past observations; affect current/future wallet totals.
- Require the target wallet currency to match the source. No currency attestation or unconfirmed-wallet move path remains; unset existing wallets are migrated to USD under the approved simplification.
- Replace snapshot capture’s raw-price selection with the shared view. Keep its midnight UTC schedule, idempotency, restricted execution, and immutable observations.
- New observations record currency, selected manual/automatic coverage, and automatic quote-time context.
- Assign observations with unset currency their wallet denomination under the approved simplification. Display them in the ordinary currency chart and remove the separate legacy-history section; recorded amounts and dates remain unchanged.
- No provider downloads occur during snapshot capture or while the app is unused.

### Success Criteria

#### Automated Verification

- Cross-surface and database tests prove effective-price parity, reassignment boundaries, and unchanged historical observations.
- Snapshot tests prove future observations use cached effective values with correct currency and source coverage.
- Creation tests prove a Yahoo selection is required, foreign/invalid selections are rejected, search/select/save never download quotes, form values survive errors, and the first explicit download verifies and prices the saved selection.

#### Manual Verification

- New-investment selection, search, linking, correction, reassignment, outage display, and wallet history work through the UI without losing form input.

## Phase 5: Release readiness

### Overview

Prove the feature locally and prepare a reviewable, schema-compatible release and recovery path. Nothing in this phase touches hosted schema, environment settings or production.

### Changes Required

#### 1. Repository and database gates

**Files:** focused service/database/browser tests; [`scripts/testing/database/`](../../../scripts/testing/database/).

**Intent:** Prove the financial and access contracts before release.

**Contract:**

- Keep CI deterministic using provider fixtures; live Yahoo probes stay explicit (`npm run probe:market-data -- --live`).
- Run repository verification in order: Astro sync, lint, Astro check, build, unit tests. Run local decimal transport, market-price, snapshot, cron and smoke checks appropriate to the changed paths.
- Close any regression gaps in ownership, decimal precision, manual boundaries, currency, reassignment and snapshot immutability found by the audit.

#### 2. Manual-selection recovery template

**Files:** [`context/deployment/automatic-stock-prices-manual-selection.sql`](../../deployment/automatic-stock-prices-manual-selection.sql), [`scripts/testing/database/test-market-price-recovery.mjs`](../../../scripts/testing/database/test-market-price-recovery.mjs), `package.json` (`test:market-prices-db`).

**Intent:** Provide a tested way to fall back to manual/sale selection without an incompatible old deployment or a destructive down migration.

**Contract:**

- The template lives outside `supabase/migrations/` and never runs in the normal chain. It is copied into a new timestamped migration only during recovery.
- It replaces only `selected_price`, `selected_date`, `selected_at`, `selected_source` with manual/sale values. It preserves view identity, column order/types, grants and `security_invoker=true`, using `CREATE OR REPLACE`.
- `capture_wallet_snapshots()` keeps its no-argument `bigint` signature, privileges, body and midnight job, so app reads and future observations switch together.
- Quote cache, targets, receipts, positions and existing observations are untouched. Automatic-only holdings show missing coverage until a manual price is saved.
- Re-enabling restores the privately recorded normal view definition through another additive migration.

#### 3. CI scope for operator SQL

**Files:** [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), [`scripts/deployment/vercel-ignore-build.sh`](../../../scripts/deployment/vercel-ignore-build.sh).

**Intent:** Operator SQL under `context/` is code, so changes to it must run CI.

**Contract:** Remove `context/**` from both docs-only ignore lists in lockstep. The `decimal-transport` job runs `npm run test:market-prices-db`, which includes the recovery test.

#### 4. Release and recovery runbook

**Files:** [`context/deployment/deploy-plan.md`](../../deployment/deploy-plan.md#stock-price-release-and-recovery), [`scripts/README.md`](../../../scripts/README.md).

**Intent:** Give the owner a single human-executable procedure for the hosted release and recovery.

**Contract:** The runbook covers:

- release boundaries
- predecessor and feature migration order
- the maintenance transition (static maintenance boundary, cron pause/restore away from 00:00 UTC, whole-chain apply, schema checkpoint, compatible app promotion)
- application acceptance
- the provider-failure table
- owner-scoped read-only inspection
- compatible recovery

It must state that the pre-migration production deployment is an inventory reference, not a rollback target. Hosted migrations, environment/protection changes, promotion and rollback stay human-owned.

#### 5. Hosted migration dry-run review

**Files:** [`verification.md`](verification.md) (owner-supplied summary only).

**Intent:** Before the release window, confirm that the hosted ledger and the pending chain match what the runbook expects. That way a missing predecessor or an unexpected applied migration is caught while nothing has changed.

**Contract:**

- The owner runs `npx supabase migration list --linked` and `npx supabase db push --dry-run` in their own authenticated terminal against the confirmed production project. These commands read the ledger and apply nothing.
- The agent compares the reported pending files with the runbook's predecessor and eight-feature migration order. It flags any unexpected applied, missing or out-of-order file.
- Record only migration filenames and pass/fail in `verification.md`. Never record connection strings, project refs beyond what the deploy plan already holds, or credentials.
- A mismatch blocks Phase 6 until the runbook is corrected and re-reviewed.

#### 6. Required stock selection for every investment

**Files:** new `supabase/migrations/<timestamp>_require_position_stock_selection.sql`, regenerated database types; the demo loader ([`scripts/demo/lib/demo-data.mjs`](../../../scripts/demo/lib/demo-data.mjs)) and every fixture that inserts positions directly (`tests/database/decimal.test.ts`, `scripts/testing/database/test-{market-prices,market-price-recovery,close,wallet,snapshots}-database.mjs`, `scripts/demo/__tests__/demo-data.test.mjs`); a migration test wired into `test:market-prices-db`; the runbook in `deploy-plan.md`; and FR-003/FR-014 in [`prd.md`](../../foundation/prd.md).

**Intent:** Every investment must have a stock selection at the database level. Existing draft investments get Apple by explicit owner decision, through the same pending-selection path new investments use, so no currency, timezone or quote is written by hand.

**Contract:**

- In one unguarded migration (see lessons: no partial `if not exists`):
  - For every account that owns positions, create or reuse a `market_listing_targets` row `yahoo`/`AAPL`/`NMS`/`EQUITY` (`Apple Inc.`, `NasdaqGS`).
  - Positions that already have `market_listing_id` get a target matching that confirmed cache identity (provider/symbol/exchange/instrument type, `cache_id` set), not Apple. None exist in production; this keeps local and demo data consistent.
  - Every other position, whether open, closed, deleted or in any wallet currency, gets the account's Apple target.
  - Disable only `positions_guard_selection` around the backfill and re-enable it in the same migration; `guard_position_selection()` itself is unchanged, so no permanent bypass exists.
  - Then `alter table public.positions alter column market_target_id set not null`.
- The migration never writes `instrument` labels, prices, manual save times, wallets, receipts, quote cache rows or observations. `market_listing_id` stays nullable and is set only by a verified download.
- New inserts must carry a valid selection receipt (the existing guard plus NOT NULL). The demo loader and fixtures create owner/wallet-bound receipts and targets through that path; the linked demo holding keeps its AAPL listing.
- Additive rollback, if ever needed, is `drop not null` in a new migration; selections stay as data.
- Add the migration to the runbook's feature-migration table, so the 5.5 dry run expects nine feature migrations.
- Update FR-003/FR-014: every investment requires a stock selection; existing draft investments were assigned Apple by owner decision on 2026-11-02; existing-position listing confirmation is retired.

#### 7. Retire existing-position listing confirmation

**Files:** [`PositionsTable.astro`](../../../src/components/positions/PositionsTable.astro), [`ListingControl.tsx`](../../../src/components/market-prices/ListingControl.tsx), [`DownloadPrices.tsx`](../../../src/components/market-prices/DownloadPrices.tsx), [`endpoint.ts`](../../../src/lib/market-data/endpoint.ts) and its tests, [`download-api.md`](download-api.md), [`ui-verification.md`](ui-verification.md).

**Intent:** A holding has exactly one stock identity, its creation-time selection, so the app must not offer or accept confirming a different listing for an existing holding.

**Contract:**

- Remove the **Link stock listing** action and the position-detail **Stock listing** controls, and the dashboard hint that points to them.
- The existing-position `listings/search`, `listings/download` and `listings/confirm` endpoints reject with HTTP 409 `selection_already_set` and do no provider work. New-investment search/select and dashboard **Download prices** are unchanged.
- A holding with the wrong stock is deleted and recreated; selections cannot be edited.
- Update the walkthrough docs to remove the existing-position linking steps.

### Success Criteria

#### Automated Verification

- Repository static/unit checks and affected local database checks pass.
- Regression scenarios cover ownership, decimal precision, manual boundaries, currency, reassignment, and snapshot immutability.
- `npm run test:market-prices-db` proves normal → manual → normal recovery parity with preserved view columns/types/grants/security-invoker mode and unchanged cache, targets, receipts, positions and observations.
- Local DB tests prove the required-selection migration gives every position a selection across accounts (open, closed, deleted and PLN/EUR-wallet holdings get an Apple selection; holdings with a confirmed listing get a selection matching that listing). It also proves labels, prices, save times, wallets and observations are unchanged, the guard is re-enabled and still rejects selection changes, inserts without a selection fail, existing-position listing confirmation is rejected, and a first explicit download prices USD-wallet Apple holdings while PLN/EUR ones report `incompatible_currency`. Fixture, demo and browser tests pass with selections created through receipts.

#### Manual Verification

- Owner reviews and approves the stock-price release and recovery runbook in `deploy-plan.md`, including the maintenance transition and the statement that no pre-feature deployment is a rollback target.
- Owner-run `supabase migration list --linked` and `supabase db push --dry-run` show a pending hosted chain that matches the runbook's migration order, with filenames and result recorded in `verification.md`.

## Phase 6: Production release and acceptance

### Overview

The owner runs the schema-first release on production and accepts the feature there. The agent prepares commands and records evidence; it does not apply hosted migrations, change settings or promote.

### Changes Required

#### 1. Schema-first maintenance release

**Files:** [`context/deployment/deploy-plan.md`](../../deployment/deploy-plan.md#schema-first-rollout) (execution), [`verification.md`](verification.md) (evidence).

**Intent:** Move production to the final schema and the compatible application without old builds serving traffic against it.

**Contract:**

- Follow the Phase 5 runbook steps in order.
- Stop on any migration error. Do not use `db reset` or ledger repair.
- Record the pre-release deployment, ledger, cron state, backups and fact digests. After the schema checkpoint, record the promoted deployment ID/URL and source commit. Restore the cron job to `0 0 * * *` with `select public.capture_wallet_snapshots();`.

#### 2. Production acceptance

**Files:** [`ui-verification.md`](ui-verification.md), [`download-api.md`](download-api.md) (walkthrough sources), [`verification.md`](verification.md) (results).

**Intent:** Confirm the shipped behavior on the real runtime and data.

**Contract:**

- Using the owner's authorised holdings, walk through `AAPL` in a USD wallet and `PKO.WA` in a PLN wallet: select at creation, explicit dashboard **Download prices**, source/market time/currency display, and no download on reload/focus/wait.
- Confirm existing manual holdings, history and wallet totals remain intact.
- Never run `npm run smoke` against production.

#### 3. Verify required Apple selections

**Files:** [`verification.md`](verification.md) (owner-supplied counts and result).

**Intent:** Confirm the migration gave every production investment a stock selection and that Apple prices arrive only through the explicit download.

**Contract:**

- The migration does the backfill; there is no separate owner-run assignment call.
- After the schema checkpoint, the owner runs a read-only count of positions with `market_target_id is null` (expected 0) and of positions per selected symbol, then clicks **Download prices**.
- Record only counts and the pass/fail result.

### Success Criteria

#### Manual Verification

- Owner-run post-migration read-only checks on production report no unset wallet currencies, labelled snapshots, matching fact digests, restricted RLS/grants, and the unchanged capture signature and cron schedule. The agent prepares the queries and records the owner-supplied results; it does not connect to production.
- Deployed production passes the AAPL/USD and PKO.WA/PLN walkthrough, with deployment ID, source commit and results recorded in `verification.md`.
- Owner-run read-only check after the schema checkpoint shows no position without a stock selection, and the next explicit **Download prices** shows a verified AAPL/USD quote for open USD-wallet holdings while PLN/EUR-wallet holdings report `incompatible_currency` with their saved values intact.

## Testing Strategy

Focus on user-visible failure modes: equal versus later timestamps, identical manual resaves, provider timeouts, omitted batch symbols, stale retained prices, incompatible currencies, foreign ownership, concurrent refreshes, closed/deleted holdings, and unchanged prior snapshots.

For snapshot parity, compare application valuation and SQL capture against the same fixed cache state. Do not expect identical totals across different market-data states.

## Performance Considerations

There is no automatic download interval. The user controls downloads through **Download prices**, and each click can request newer prices even after a recent successful download. In-flight deduplication, the 30-second refresh lease, the 15-minute failed-attempt cooldown and longer provider retry delays still apply; cooldown expiry never triggers a request by itself. The provider budget bounds button-request latency. Navigation and investment-save POSTs use saved quotes without provider calls.

## Migration Notes

Use additive migrations. The owner explicitly authorized assigning USD to wallets without currency and inheriting wallet currency for observations without a label. Keep recorded numeric amounts, dates and results intact. Do not guess listing identities, historical manual-save times or missing source coverage. New wallets still choose USD/PLN/EUR; conflicting wallet denominations remain incompatible.

The denomination migration is not backward compatible with pre-feature builds. Release schema-first behind a maintenance boundary. Recover through the additive manual-selection view template, never a down migration or an old deployment (see the 2026-11-02 release revision).

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

- [x] 3.1 Service tests prove batching, deduplication, deadlines, cooldown, partial results, and retained-cache behavior. — `0201301`
- [x] 3.2 Endpoint tests reject unauthenticated, foreign-position, incompatible-currency, and malformed requests. — `0201301`
- [x] 3.4 Trigger tests prove quote downloads require the button POST and never run on page reads, reloads, listing confirmation, timers or snapshot capture. — `0201301`

#### Manual

- [x] 3.3 Listing search distinguishes exchange/currency choices and provides a recoverable unavailable state. — `0201301`

### Phase 4: Application integration and future observations

#### Automated

- [x] 4.1 Cross-surface and database tests prove effective-price parity, reassignment boundaries, and unchanged historical observations. — `0a954cb`
- [x] 4.2 Snapshot tests prove future observations use cached effective values with correct currency and source coverage. — `0a954cb`
- [x] 4.4 Creation tests prove a Yahoo selection is required, foreign/invalid selections are rejected, search/select/save never download quotes, form values survive errors, and the first explicit download verifies and prices the saved selection. — `0a954cb`

#### Manual

- [x] 4.3 New-investment selection, search, linking, correction, reassignment, outage display, and wallet history work through the UI without losing form input. — `0a954cb`

### Phase 5: Release readiness

#### Automated

- [x] 5.1 Repository static/unit checks and affected local database checks pass.
- [x] 5.2 Regression scenarios cover ownership, decimal precision, manual boundaries, currency, reassignment, and snapshot immutability.
- [x] 5.4 `npm run test:market-prices-db` proves normal → manual → normal recovery parity with preserved view columns/types/grants/security-invoker mode and unchanged cache, targets, receipts, positions and observations.
- [x] 5.6 Local DB tests prove the required-selection migration gives every position a selection across accounts (open, closed, deleted and PLN/EUR-wallet holdings get an Apple selection; holdings with a confirmed listing get a selection matching that listing). It also proves labels, prices, save times, wallets and observations are unchanged, the guard is re-enabled and still rejects selection changes, inserts without a selection fail, existing-position listing confirmation is rejected, and a first explicit download prices USD-wallet Apple holdings while PLN/EUR ones report `incompatible_currency`. Fixture, demo and browser tests pass with selections created through receipts.

#### Manual

- [x] 5.3 Owner reviews and approves the stock-price release and recovery runbook in `deploy-plan.md`, including the maintenance transition and the statement that no pre-feature deployment is a rollback target.
- [x] 5.5 Owner-run `supabase migration list --linked` and `supabase db push --dry-run` show a pending hosted chain that matches the runbook's migration order, with filenames and result recorded in `verification.md`.

### Phase 6: Production release and acceptance

#### Manual

- [ ] 6.1 Owner-run post-migration read-only checks on production report no unset wallet currencies, labelled snapshots, matching fact digests, restricted RLS/grants, and the unchanged capture signature and cron schedule. The agent prepares the queries and records the owner-supplied results; it does not connect to production.

- [ ] 6.2 Deployed production passes the AAPL/USD and PKO.WA/PLN walkthrough, with deployment ID, source commit and results recorded in `verification.md`.
- [ ] 6.3 Owner-run read-only check after the schema checkpoint shows no position without a stock selection, and the next explicit **Download prices** shows a verified AAPL/USD quote for open USD-wallet holdings while PLN/EUR-wallet holdings report `incompatible_currency` with their saved values intact.
