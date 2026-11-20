# Test Plan

> Risk-led testing guide. Read before adding tests.
> Strategy and response guidance refreshed with user authorization on 2026-11-20.
> Source research: `context/changes/test-plan-refresh-2026-11-20/research.md`.
> Local execution results are recorded below; remote CI and branch protection remain unverified.

## 1. Strategy

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins.
   Use database tests for real policies and SQL boundaries, HTTP tests for request/HTML
   contracts, and browser tests for behavior that depends on hydration or interaction.
   Do not add visual AI over a deterministic assertion that already catches the regression.
2. **User concerns are first-class evidence.** The current priorities are “data leaking”
   and past decisions failing to appear during investment creation. The author explicitly
   requested an E2E test showing previous investments' written reasons. No past incident
   or frequently changed area lacking confidence was reported in the refresh interview.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Expected values come from the PRD, an independent hand calculation or the interview,
not from production helpers. A comparison between two production calculations checks
consistency; it does not independently establish arithmetic correctness.

The confirmed discovery scopes were `src/`, `supabase/migrations/` and `scripts/`,
excluding docs, fixtures, tests, generated types and build output. Discovery found usable
recent history, including dashboard, service and database-tooling churn. Use this as
likelihood evidence, not proof of a defect or a claim about failure location.
The linked research provides implementation anchors separately from this risk map.

## 2. Risk Map

Priority reflects current user concerns and impact, tempered by existing protection.
The risk map combines inspected assertions with the bounded local execution evidence in §6.6.

| #   | Risk (failure scenario)                                                                                                                                                                   | Impact | Likelihood | Source (evidence, not code anchors)                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Another account or an anonymous visitor reads private diary information or changes someone else's records, including data serialized into a page but hidden in the UI                     | High   | Medium     | Refresh interview Q1; PRD access control/privacy guardrails; roadmap S-06; archived database-contract consolidation                     |
| 2   | Choosing a reason category while creating an investment fails to show matching past investments, their written reasons and results before saving, or leaves stale history after switching | High   | Medium     | Refresh interview Q1/Q4 and explicit E2E request; PRD US-01/FR-012; archived reason-confrontation; discovery dashboard churn            |
| 3   | A result or wallet total silently misstates net commissions, denomination, effective price or its date, leading the author to judge a false outcome                                       | High   | Medium     | PRD FR-003/006/007/010/013–016; archived result-correctness and automatic-stock-prices; refreshed requirements                          |
| 4   | Delete/restore, closing, reassignment or later edits corrupt saved facts or rewrite historical wallet observations                                                                        | High   | Medium     | PRD FR-007/009/013/016; no-silent-data-loss guardrail; archived close-position, recoverable-delete and wallet-performance-dashboard     |
| 5   | Local checks pass while production migration privileges or hosted auth settings prevent private diary access or behave differently                                                        | High   | Medium     | Prior interview migration/auth concerns retained from the October guide; archived database-contract consolidation; deployment checklist |

These likelihood labels are qualitative judgments, not measured defect rates.
Platform outages remain operational/observability concerns. Closing public sign-up
does not replace ownership tests; hosted sign-up settings still need human evidence.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                         | Must challenge                                                                             | Context research must ground                                                                                     | Cheapest useful layer                                                                                                   | Anti-pattern to avoid                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| #1   | Owner access succeeds; foreign/anonymous attempts reveal no private rows, reasons or serialized IDs and change no foreign state                                     | “Hidden in the browser means private”; “RLS enabled covers RPCs and views too”             | Request identity, real policy/view/RPC boundaries, serialized props, valid preconditions for negative attempts   | Retain catalog SQL, real PostgREST and raw-response HTTP checks; add targeted cases only after a concrete assertion gap | Mocked policy checks; a negative request rejected for an unrelated invalid selection                                |
| #2   | With real local history, selecting A reveals exact earlier reasons and results before Save; selecting B removes A and shows B; an empty category has an explanation | “Creation succeeded, so earlier decisions were visible”; “SSR proves hydrated interaction” | Preloaded eligible history, category state, panel wiring, open/closed/deleted cases and read-failure distinction | Focused Playwright interaction; reuse existing DB/HTTP protection                                                       | Checking only category selection/status; using DOM invisibility as a privacy proof; inventing a category-fetch race |
| #3   | Literal independent values protect net results, missing coverage and price dates; real SQL proves any selected timestamp boundary                                   | “Two production helpers agreeing proves correctness”                                       | Existing exact-decimal, fee/rendering tests, SQL effective-price decisions and accepted omitted assertions       | Existing unit/SSR/DB suites; narrowly scoped DB additions if an accepted gap is reopened                                | Rebuilding broad fee coverage or using provider calls/sleeps as the oracle                                          |
| #4   | Restored facts and permitted move changes match saved originals; selected immutability cases leave earlier observations intact                                      | “Success response means unchanged persisted state”                                         | Existing restoration/move/capture assertions and the consolidation's accepted omissions                          | Real DB persisted-state comparisons                                                                                     | Treating position-row preservation as proof about snapshots; silently reinstating deliberately removed tests        |
| #5   | Fresh replay and grant/ownership contracts run on qualifying PRs; auth wiring has safe redirects; hosted settings have dated human evidence                         | “Green local SQL is hosted parity”; “workflow configured means required and green”         | Separate SQL fake-auth, real local transport, cron infrastructure and hosted settings                            | Existing CI/database checks plus manual hosted checklist                                                                | Claiming deployed-runtime parity from build-then-dev browser serving                                                |

## 3. Phased Rollout

Statuses describe the remaining rollout, not whether a related feature exists.
Vocabulary: `not started` → `change opened` → `researched` → `planned` →
`implementing` → `complete`.

| #   | Phase name                                   | Goal                                                                                                                                            | Risks covered | Test types                                     | Status       | Change folder                                  |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- | ------------ | ---------------------------------------------- |
| 1   | Result correctness                           | Preserve shipped exact-decimal arithmetic, transport and result rendering protection                                                            | #3            | unit, SSR, real database                       | complete     | context/archive/2026-10-19-result-correctness/ |
| 2   | Private decision history                     | Protect hydrated past-reason display while retaining existing privacy contracts; remote PR confirmation remains pending                         | #1, #2        | browser; existing DB/HTTP privacy protection   | implementing | test-plan-refresh-2026-11-20                   |
| 3   | Environment evidence and accepted-gap review | Reconcile remaining hosted/manual evidence; explicitly decide whether any previously accepted financial/persistence omission warrants reopening | #3, #4, #5    | manual checklist; targeted DB only if selected | not started  | —                                              |
| 4   | Quality gates and cookbook                   | Retain the configured focused browser gate and cookbook; separately scope remaining hook/gate decisions                                         | cross-cutting | CI gate, documentation; test hook if justified | not started  | —                                              |

Phase 1 completion comes from its archived checked Progress, including manual and
remote CI items; it is not a new test run. Phases 2–4 were previously labelled
“not started” broadly, despite shipped ownership, migration and auth tests.
Those existing components are credited in §4–§6; the refreshed rows describe what remains.
The approved refresh plan is being implemented. The local history scenario and focused CI job exist;
Phase 2 remains implementing until its pending remote PR confirmation is recorded. The focused
browser gate contributes to Phase 4 without completing its remaining scope.

Order: prioritize the author's requested browser behavior, retain shipped privacy
contracts, then address evidence/gating decisions. Do not automatically create a broad
financial-testing phase: §7 records accepted omissions. Later phases need their own
scope/decision before change IDs are assigned. Archived wallet-dashboard human checks
remain pending and are not satisfied by this document update.

## 4. Stack and Existing Protection

**Test-base profile, checked 2026-11-20:** meaningful, distributed unit/SSR, database,
browser and script suites. The discovery inventory counted 57 test/setup files;
that count includes setup and separate runners and is not a runnable test count or
coverage measure. Implementation has since passed 548 unit/SSR tests in 40 files and
the focused history browser scenario twice consecutively. Other suites were inspected,
not freshly executed; see §6.6 for verification boundaries.

| Layer                 | Existing tool/surface                         | Execution and bounded protection                                                                                                                                    |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit, handler and SSR | Vitest through Astro `getViteConfig`          | `npm test`; application `*.test.ts` plus script TypeScript tests; decimal/fee arithmetic, validation, result rendering, auth wiring, error privacy                  |
| Real local database   | Separate Vitest database config               | `npm run test:decimal-db`; local PostgREST/service numeric transport, ownership, prices, commissions, moves, restore and snapshots                                  |
| Catalog contract      | Disposable SQL database                       | `npm run test:contract-db`; ordinary public-table RLS/owner fixtures, foreign operations and fingerprints; policy/grant checks and anonymous table/view privileges  |
| Cron and recovery     | Local SQL runners                             | `npm run test:wallet-cron`, `npm run test:recovery-db`; infrastructure registration and recovery-template contracts                                                 |
| HTTP smoke            | Node HTTP walk                                | `npm run smoke` against a local running app; auth, raw-body privacy, selected-category SSR history, delete/restore and other user flows                             |
| Browser               | Playwright Test, existing Chromium/auth setup | `npx playwright test`; existing login/session, creation, wallet, price and commission specs; `--project=decision-history` isolates the new pre-save reason scenario |
| Script-specific tests | Node test runner                              | Review-script tests are explicitly invoked in CI; demo-data tests have their own `test:demo-db` command                                                             |

The catalog contract is table-centric; it does not automatically exercise ownership
through each view/RPC. Real transport suites supply additional view/RPC coverage.
The disposable SQL harness uses fake auth/JWT-subject functions and excludes the cron
migration; cron is checked separately in its configured local database. This is useful
production-like privilege evidence, not a complete hosted-environment replica.

Current manifest ranges include Astro ^7.3.2, Vitest ^5.0.5 and Playwright ^1.64.1.
These are manifest declarations, not fresh installed-version verification.
Playwright builds then serves Astro dev because this adapter has no Astro preview
entrypoint. That browser run does not prove deployed SSR parity.
The existing Chromium project uses shared local test credentials. The separate
`decision-history` project has empty storage state and no setup dependency: its scenario
creates and signs in a disposable account, and checks app/local-stack agreement. The
focused CI job provisions local Supabase and Chromium without persistent E2E credentials.

**Stack grounding tools (current session; checked 2026-11-20):**

- Docs: Context7/framework-docs MCP not available in current session; no API/setup changes proposed.
- Search: Exa and built-in web tools exposed; not needed for this local source investigation.
- Runtime/browser: computer/browser control exposed; not used. Repository Playwright configuration was inspected.
- Provider/platform: project GitHub/Supabase/Vercel MCPs not available in current session; no hosted inspection performed.

No new tool or library is recommended by this refresh. Source research, rather than
external documentation, grounds the existing execution contracts described here.

## 5. Quality Gates

| Gate                                                                                | Current location/status                             | Signal and remaining work                                                                                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Lint                                                                                | pre-commit; CI                                      | Wired; pre-commit runs whole-repo lint                                                                                                  |
| Unit/SSR, review-script tests, Astro check, build                                   | `ci` on qualifying master PRs/pushes                | Wired; docs-only changes skip this workflow                                                                                             |
| Real DB transport/services, cron, recovery, account provisioning, SQL access/grants | `decimal-transport` on qualifying master PRs/pushes | Wired; already ships substantial former Phase 2/3 scope                                                                                 |
| HTTP smoke                                                                          | master push                                         | Wired after merge, not a PR gate                                                                                                        |
| Playwright decision history                                                         | `decision-history` on qualifying master PRs/pushes  | Configured focused Chromium job with local Supabase and seven-day diagnostics; remote run pending. The full browser suite remains local |
| Hosted auth/schema review                                                           | deployment checklist                                | Human evidence required; this refresh did not inspect hosted settings                                                                   |
| Edit-time hook                                                                      | existing Claude settings                            | Formats with Prettier; does not run unit tests. A test hook remains a separate decision                                                 |

“Wired” describes inspected workflow/configuration, not branch protection, current green
runs or human signoff. Branch protection and hosted state remain unverified.
Do not treat automated AI review workflows as substitutes for executable test gates.

## 6. Cookbook Patterns

### 6.1 Unit and SSR contracts

- Put application `*.test.ts` beside the module; `npm test` uses `vitest.config.ts`.
- Use literal expected values from an independent calculation. Fee-free buy 50, quote 60,
  quantity 10 yields amount 100 and +20.00%. Canonical decimal strings and exact units
  preserve the financial contract; do not substitute floating-point tolerances.
- Include rounding ties, losses, rounded zero, missing quantity/price, commission and date
  boundaries when relevant. Freeze and restore time for date-sensitive validation.
- For render wiring, use Astro Container/React SSR with real arithmetic and formatting;
  mock only I/O. Assert a named record's result/date rather than whole-page snapshots.
- Examples: `src/components/positions/result-surfaces.test.ts`,
  `src/lib/result.test.ts`, `src/lib/wallet.test.ts`.
- For a changed test, deliberately break the protected behavior, observe the focused
  failure and restore the source unconditionally. Do not run mutation tests without
  a concrete current risk; follow repository mutation guidance.

### 6.2 Real local Supabase integration and privacy

- Add real transport/service cases under `tests/database/`; run `npm run test:decimal-db`.
  The launcher discovers local credentials without printing them and rejects nonlocal URLs.
- Use disposable accounts and clean up in `finally`. Keep privileged setup separate from
  requests/assertions made as the actual owner, foreign user or anonymous caller.
- Assert exact persisted facts as well as refusal. For a negative case, make unrelated
  inputs valid so an earlier validation error cannot masquerade as ownership protection.
- Examples: `tests/database/decimal.test.ts`, `effective-valuations.test.ts`,
  `market-selections.test.ts`, `commissions.test.ts`.
- Retain raw HTTP privacy checks: reasons can leak in serialized props even when not
  visibly rendered. `scripts/testing/smoke.mjs` checks foreign new-form HTML.

### 6.3 Tables, migrations and infrastructure

- Run `npm run test:contract-db` after migration/RLS/grant changes. A new ordinary public
  table needs an access fixture; check owner read, foreign attempts and unchanged rows.
- Do not add grants to the SQL harness to make tests pass: migration privileges are part
  of the behavior being tested.
- The catalog contract covers tables and privilege invariants, not a complete RPC/view
  behavior matrix. Add targeted real transport assertions for an exposed new boundary.
- Cron runs separately with `npm run test:wallet-cron`; recovery-template/view changes may
  need `npm run test:recovery-db`. Follow the repository verify skill for changed code.

### 6.4 Auth-adjacent routes

- Existing examples: `src/lib/auth-signin.test.ts`, `auth-return.test.ts`,
  `auth-cookies.test.ts` and the HTTP smoke walk.
- Check validated internal return destinations, fixed safe failure messages, callback
  success/rejection/exception and request-cookie behavior at the appropriate boundary.
- Mocking the auth provider proves handler decisions, not library internals or hosted
  settings. Retain the manual deployment checklist; do not infer its completion locally.

### 6.5 Browser protection for past decisions

- Run `npx playwright test --project=decision-history` against local Supabase. The
  project selects `tests/e2e/decision-history.spec.ts` without running shared auth setup.
- The implemented fixture creates a confirmed disposable account, one USD wallet,
  categories A/B/Empty, valid stock-selection receipts and four saved records: open and
  closed A, open B, and deleted A. Setup and assertions use fixed past dates and short reasons.
- After hydration, the test selects A and checks the exact visible reasons, record IDs,
  independent percentage values and dates; it switches to B and checks A disappears;
  Empty has an explanatory notice. Deleted A stays excluded. A before/after saved-row
  comparison proves that category interaction creates or changes no position.
- This path filters preloaded history synchronously; do not invent category-request races.
  Stock/provider search is unnecessary for the pre-save observation.
- If testing long-reason readability, exercise “Show full reason”; text merely existing
  in the DOM does not prove it is readable after clamping.
- The account is deleted in `finally`, including partial setup failures; cleanup errors
  fail the scenario. Keep policy and raw-response privacy assertions in their existing layers.
- During planning, the user explicitly declined additional privacy tests because those
  boundaries are already tested. No new privacy or pure-state unit cases are part of this change.
- The CI job uses the repository's Node pin and Supabase CLI pin, installs Chromium,
  writes local-only app configuration without printing credentials, runs this project,
  preserves browser reports/failure diagnostics for seven days, and always stops Supabase.
  Qualifying PR/master triggers and docs-only exclusions match the existing workflow.
- The browser scenario passed twice locally without shared E2E credentials. CI job
  configuration is implemented and syntax-checked; no remote passing run is claimed.

### 6.6 Evidence and maintenance

The result-correctness archive records its original verification. The later consolidation
ships access/grant contracts and explicitly retains accepted gaps. Wallet-dashboard
archival still includes pending human acceptance. Use the refresh research for precise
source anchors; record new run dates/results when implementation actually executes checks.

Local implementation evidence on 2026-11-20: `npm test` passed 548 tests in 40 files;
whole-repo lint passed; `astro check` examined 184 files with zero errors, warnings or
hints. The focused browser scenario passed twice consecutively with shared E2E credentials
empty. Discovery selected its single scenario and retained the existing Chromium
project's 23 discovered tests including setup. These results do not establish a remote
CI pass, hosted parity or branch protection; the PR confirmation remains pending.
The production build and the focused browser run with CI settings also passed. Removing
the panel deliberately failed the expected two-entry assertion; the source was restored
byte-for-byte before the passing CI-mode run. See the change verification log for details.

## 7. What We Deliberately Don't Test

Existing exclusions remain in force:

- **`/dev/kitchen-sink` and UI-token styling:** visual polish checked by eye; revisit if
  styling becomes the sole carrier of meaning.
- **Pixel/snapshot tests of the dashboard:** avoid broad visual snapshots; revisit if a
  specific rendering failure warrants a focused assertion.
- **Supabase auth internals:** test this project's wiring, not the vendor's implementation.
- **Reason lock (S-07) and category rename/removal (S-08):** do not invent unbuilt behavior;
  revisit against the actual shipped feature and current requirements.

**Accepted omissions, separate from the above exclusions:** database consolidation
explicitly dropped some price-timestamp and historical-observation assertions.
Current tests protect a manual override, capture after close and recovery preservation,
but do not establish the full manual/quote equality/resubmission matrix or observation
preservation across move/delete/restore/baseline edits. These are documented candidates,
not automatically reopened commitments. See the consolidation assertion map and refresh
research before spending test effort. A future decision must name the regression and
independent oracle it buys.

## 8. Freshness Ledger

- Strategy, risk response and shipped-evidence reconciliation: 2026-11-20.
- Local implementation checks: 2026-11-20; unit/SSR, lint, Astro check, build, deliberate-break and focused browser runs passed as bounded in §6.6. Broader database/browser suites were not rerun.
- Manifest declarations checked: 2026-11-20; installed tool versions not freshly verified.
- Current-session tool availability checked: 2026-11-20; Playwright CI/project guidance is linked in the approved implementation plan.
- Hosted settings, branch protection and current remote runs: not checked.
- Related documentation follow-up: `test-stack.md` contains an outdated sign-in landing
  note; current auth setup expects `/dashboard`. Update through its owning E2E setup
  workflow when that document is next maintained.

Refresh when a new priority risk appears, stack/tool behavior changes, accepted omissions
are reconsidered, exclusions stop matching the team's intent, or dated tooling guidance
is more than three months old.
