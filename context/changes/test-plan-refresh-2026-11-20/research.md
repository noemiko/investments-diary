---
date: 2026-11-20T12:46:20Z
researcher: Codex
git_commit: 4b40a98badc852821766875b307d3b5ca29850e3
branch: update-docs-about-project
repository: investments-diary
topic: Test-plan refresh for privacy and past investment reasons
tags: [research, testing, privacy, confrontation, financial-results]
status: complete
last_updated: 2026-11-20
last_updated_by: Codex
last_updated_note: Grounded the accepted refresh and updated the guide at the user's explicit request
---

# Research: Test-plan refresh

## Research Question

Ground the accepted brief in `change.md`: locate privacy and past-reason display paths,
inventory existing assertions and CI wiring, reconcile shipped evidence, and identify
useful additions without duplicating protection. During research the user explicitly
requested updating `context/foundation/test-plan.md`; this authorizes the guide refresh,
including strategy and risk guidance. It does not authorize implementing tests or gates.

## Summary

- The requested browser test is justified: the creation test selects a category but
  does not assert earlier reasons. Its fixture creates a category and selection receipt,
  without an earlier investment (`tests/e2e/investment-persists.spec.ts:55`,
  `tests/e2e/helpers/investment-data.ts:69`). Inspected browser specs do not exercise
  category switching with past-reason assertions.
- Ownership protection is already implemented at complementary SQL, PostgREST and HTTP
  layers. The catalog contract discovers ordinary public tables; this is not automatic
  behavioral coverage of views, RPCs or cookie transport
  (`scripts/testing/database/contract/access.mjs:93`,
  `scripts/testing/database/contract/grants.mjs:25`, `tests/database/decimal.test.ts:301`).
- Financial and restoration tests are substantial. Specific timestamp and historical
  observation cases remain candidates, but the consolidation ledger deliberately accepted
  missing assertions. Do not reopen those decisions merely to raise coverage
  (`context/archive/2026-11-02-consolidate-db-contract-tests/verification.md:146`,
  `context/archive/2026-11-02-consolidate-db-contract-tests/verification.md:201`).
- CI runs database contracts on qualifying PRs; HTTP smoke is push-only and the inspected
  workflows do not invoke Playwright. Configuration is not evidence of a current green
  run or branch protection (`.github/workflows/ci.yml:6`, `:44`, `:83`).

## Detailed Findings

### Privacy: protect serialized data as well as visible rows

`src/middleware.ts:9` resolves the request user and gates dashboard requests.
`src/lib/supabase.ts:14` builds the request-bound cookie client. The creation page
also rejects absent users (`src/pages/dashboard/new.astro:33`), checks POST origin
(`:75`) and strips foreign category/wallet choices before rerender (`:148`, `:161`).

The history read selects reason text from `position_effective_prices`, excludes deleted
rows, paginates and orders by buy date, creation time and ID
(`src/lib/services/positions.ts:116`). Ownership relies on database policy through the
security-invoker view, not an explicit service query owner predicate
(`supabase/migrations/20261109152659_position_commissions.sql:19`).
The page passes the preloaded history into the hydrated form
(`src/pages/dashboard/new.astro:179`, `:199`). Consequently, a browser check that foreign
rows are invisible cannot establish that foreign reasons are absent from HTML/island props.

Existing protection:

- SQL contract discovers ordinary tables with `relkind = 'r'`, requires RLS, an owner
  column and fixtures; it exercises owner reads, foreign operations and privileged
  before/after fingerprints (`scripts/testing/database/contract/access.mjs:93`, `:131`,
  `:142`). Anonymous reads must be refused (`:172`).
- Grant checks cover policy/grant consistency, authenticated view readability and
  anonymous table/view privileges (`scripts/testing/database/contract/grants.mjs:9`).
- Real PostgREST service tests cover foreign history and unavailable/foreign/deleted
  records (`tests/database/decimal.test.ts:301`, `:493`); effective-price view isolation
  is asserted separately (`tests/database/market-prices.test.ts:112`).
- HTTP smoke checks B's raw new-form body for A's reasons/IDs and checks an empty history
  for B typing A's category name (`scripts/testing/smoke.mjs:744`). It also exercises
  anonymous creation/delete/detail (`:1182`).
- Telemetry privacy has deterministic sentinel assertions against submitted/private data
  in events (`src/lib/observability/privacy.test.ts:12`, `:119`, `:196`). This is additional
  protection, not a complete audit of logging or hosted telemetry.

One test-strength limitation: the foreign-wallet creation smoke attempt expects a
selection error (`scripts/testing/smoke.mjs:733`). Receipt validation occurs before the
save (`src/pages/dashboard/new.astro:102`, `src/lib/services/positions.ts:269`), so that
attempt alone cannot prove it reached the intended wallet ownership boundary. Before
adding a case, map the selection/receipt ownership tests to this precise threat. If still
unprotected, use a focused real-database attempt with otherwise valid caller data and
verify refusal and unchanged state. This is not evidence of an exploitable leak.

### Past reasons: real interaction gap, synchronous category switching

The independent oracle is PRD US-01: matching own positions, their written reasons and
results must appear before saving, with an explanatory empty state
(`context/foundation/prd.md:79`). The preload spans categories and wallets. Filtering is
synchronous in-memory: ID selection, trimmed case-insensitive typed existing category,
no-category, unavailable and history states (`src/lib/confrontation.ts:17`). There is no
history fetch race to simulate when switching categories in this implementation.

`src/components/positions/PositionForm.tsx:91` initializes category choice, `:240` derives
the panel state, `:439` handles selection and `:498` renders it.
`src/components/positions/ConfrontationPanel.tsx:58` renders entry IDs and reason text;
`:71` renders results; `:131` distinguishes no choice, failed read and true empty history.
Long reasons are clamped after mount and expandable (`:18`); DOM text existence alone
does not prove a clamped reason is readable.

Existing SSR tests render prebuilt history and assert result/date wiring
(`src/components/positions/result-surfaces.test.ts:224`, `:745`). Smoke checks native
POST selected-category history, deleted exclusion, typed existing-name matching,
restoration and cross-wallet history (`scripts/testing/smoke.mjs:562`, `:659`, `:991`).
Real DB tests assert history reads, ownership, effective price, deletion and restoration
(`tests/database/decimal.test.ts:281`, `:581`,
`tests/database/effective-valuations.test.ts:133`). These do not establish hydrated form
selection and reason visibility.

Smallest useful addition: a local-data browser scenario seeds distinctive prior reasons
in categories A and B plus an empty category, including eligible open and closed entries.
After hydration, choose A and inspect exact reason text and record IDs in the named
panel before any save; switch to B and assert A disappears; choose empty and assert the
notice. Check no new position was created by selection. Avoid live provider/search work:
this scenario need not save a new investment. Retain SQL/HTTP privacy assertions.

A small pure-state unit table can cheaply cover typed-name trim/case matching and
no-category/unavailable/empty distinctions. No dedicated state-helper test was found
in the inspected application tests; the browser scenario should not repeat every branch.

### Financial and persistence protection

- Independent net-return values are present in `src/lib/result.test.ts:170`; commission
  rendering is checked across result surfaces in
  `src/components/positions/result-surfaces.test.ts:745`.
- Unpriced fees, incomplete coverage and exact totals are checked in
  `src/lib/wallet.test.ts:241` and `tests/database/commissions.test.ts:106`.
- Database commission tests cover defaults, invalid inputs, atomic closes, quantity
  preservation and competing closes (`tests/database/commissions.test.ts:63`, `:133`).
  Browser commission tests exercise hydrated and no-JS paths
  (`tests/e2e/position-commissions.spec.ts:5`, `:43`).
- Effective-price consistency and a manual correction are checked through real reads
  (`tests/database/effective-valuations.test.ts:131`). Currency and foreign moves are
  refused; a successful move changes the saved position's wallet ID alone (`:153`).
- Delete/restore checks preserve saved detail, exact totals and history eligibility
  (`tests/database/decimal.test.ts:546`, `tests/database/commissions.test.ts:214`).
- Snapshot coverage includes exact signed rows, foreign read isolation and denied caller
  capture/update (`tests/database/wallet-snapshots.test.ts:36`), same-day capture after
  close (`tests/database/commissions.test.ts:145`, `:206`) and retained observations
  during manual recovery (`scripts/testing/database/test-market-price-recovery.mjs:67`).

Candidate gaps, not confirmed production defects:

- SQL quote/manual-save equality, newer quote and identical manual resubmission. The
  view uses `q.market_at <= p.manual_price_saved_at` and the stamp trigger handles
  identical submissions (`supabase/migrations/20261030110418_market_price_persistence.sql:139`,
  `:218`). The inspected DB tests cover a manual override but not that boundary matrix.
- Saved observations before/after wallet moves, delete/restore and baseline edits. The
  move test compares the position row, not existing observations
  (`tests/database/effective-valuations.test.ts:153`); capture-after-close and recovery
  provide narrower immutability evidence.

The consolidation ledger labels related timestamp and historical-preservation assertions
“not covered (accepted)” (`context/archive/2026-11-02-consolidate-db-contract-tests/verification.md:146`,
`:150`, `:201`). Keep these explicit in the guide; reopening them needs a risk decision.
If selected later, local DB fixtures with controlled timestamps and literal expected
values are cheaper and stronger than provider calls or more browser arithmetic tests.
Cross-path equality using production `walletValue` is a consistency check, not an
independent arithmetic oracle (`tests/database/effective-valuations.test.ts:140`).

### Execution surfaces and environment parity

`npm test` discovers `src/**/*.test.ts` and script TypeScript tests, not the DB/browser
trees (`package.json:19`, `vitest.config.ts:8`). The database launcher discovers the local
Supabase stack and rejects nonlocal URLs (`scripts/testing/database/test-decimal-database.mjs:3`);
it invokes the separate database config (`vitest.database.config.ts:5`).

The contract replays migrations in a disposable DB with a fake auth schema and JWT-subject
function (`scripts/testing/database/test-contract-database.mjs:22`,
`scripts/testing/database/lib/db-harness.mjs:125`). Its chain excludes the cron migration
(`scripts/testing/database/lib/db-harness.mjs:11`); the cron runner tests that migration
separately in a rolled-back transaction (`scripts/testing/database/test-wallet-cron.mjs:9`).
Do not describe this as a hosted Supabase clone or a behavioral contract for every RPC.

The inspected CI workflow triggers for qualifying master PRs/pushes and skips docs-only
changes (`.github/workflows/ci.yml:6`). Its `ci` job invokes unit tests, review-script tests,
lint, Astro check and build (`:33`). `decimal-transport` invokes local DB, cron, recovery,
account creation and catalog contracts (`:65`). HTTP smoke is restricted to pushes (`:83`).
No Playwright invocation is present in the inspected workflows: `ci.yml`, `claude.yml`,
`pr-review.yml`, `ai-toolkit.yml`; the latter workflows provide automated/interactive reviews,
not a defined browser regression job. Branch protection and current remote results were
not inspected.

Playwright uses Chromium plus auth setup, retries/traces/screenshots and build-then-dev
serving (`playwright.config.ts:10`). Auth setup requires a local test user's environment
credentials (`tests/e2e/auth.setup.ts:4`); the disposable fixture helper independently
enforces local stack/app agreement (`tests/e2e/helpers/investment-data.ts:7`). A browser
CI gate therefore needs local provisioning, browser installation and fixture isolation;
do not assume adding a bare command is sufficient.

The existing edit hook formats files, not runs tests (`.claude/settings.json:5`);
pre-commit runs lint (`.husky/pre-commit:1`). The callback and validated dashboard return
destinations already have handler/unit assertions (`src/lib/auth-signin.test.ts:36`,
`:90`, `src/lib/auth-return.test.ts:4`). Hosted settings remain a manual evidence gap;
`context/foundation/test-stack.md:28` still describes obsolete sign-in landing behavior,
contradicted by `tests/e2e/auth.setup.ts:20` and `src/pages/api/auth/signin.ts:27`.

## Historical Context and Guide Reconciliation

- **Supported completion:** result correctness Progress has checked automated, manual and
  remote CI items (`context/archive/2026-10-19-result-correctness/plan.md:147`). Guide Phase 1
  can be marked complete from recorded evidence; this is not a new execution result.
- **Partially stale:** private-data/environment phases have shipped components outside the
  original rollout folders, including DB contracts; remaining scope must be separated from
  those components (`context/archive/2026-11-02-consolidate-db-contract-tests/plan.md:368`).
- **Contradicted pre-refresh browser claim:** the guide at the researched commit says
  E2E is unplanned (`4b40a98:context/foundation/test-plan.md:118`), but a configured
  browser suite exists (`playwright.config.ts:10`). The refreshed guide corrects this.
- **Supported caution:** workflow wiring still does not prove branch protection. The
  refreshed guide retains the prior caveat (`4b40a98:context/foundation/test-plan.md:109`).
- **Pending acceptance:** archived wallet dashboard verification explicitly reopens human
  checks (`context/archive/2026-10-28-wallet-performance-dashboard/verification.md:23`).
  Do not convert archive placement into acceptance.
- **Exclusions:** preserve the guide's styling/snapshot, library-internal and unbuilt-feature
  exclusions. Generated types were mentioned as an interview example, but were not an
  existing listed exclusion; do not silently add a new one.

## Architecture Insights and Recommended Response

Prioritize the missing browser observation of an existing product promise. Keep table RLS,
real transport, raw HTML privacy and hydrated behavior as complementary contracts. Update
the cookbook around those actual scopes. Preserve accepted financial omissions unless a
new concern justifies reopening a specific case. Test/gate implementation requires a plan.

## Code References and Related Research

Primary path: `src/pages/dashboard/new.astro:179` →
`src/lib/services/positions.ts:116` → `src/lib/confrontation.ts:17` →
`src/components/positions/PositionForm.tsx:240` →
`src/components/positions/ConfrontationPanel.tsx:119`.

Historical research: `context/archive/2026-10-19-result-correctness/research.md`,
`context/archive/2026-11-02-consolidate-db-contract-tests/research.md`,
`context/archive/2026-10-29-automatic-stock-prices/research.md`.

## Limits, Open Questions and Validation

This is source research, not a new green run or an exhaustive security audit. No tests,
builds, live provider requests, hosted inspection or Vercel operations were run. Read-only
workers investigated privacy, history and financial/persistence dimensions; the primary
inspected decisive paths and CI/historical evidence and synthesized the guide. Current
remote status, hosted settings and browser-CI provisioning remain unverified.

No new product decision blocks the requested history test. Planning should decide whether
to make a focused browser scenario a PR gate and whether a demonstrated ownership test
weakness needs a targeted addition. Accepted financial omissions remain deferred. The
guide refresh itself does not mark these implementation tasks complete.
