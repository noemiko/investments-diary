---
date: 2026-10-19T16:58:58+02:00
researcher: Codex
git_commit: 5fbe2c3e461b990aa7f2e31a1ebcc3273462347a
branch: chore/archive-named-wallets
repository: investments-diary
topic: Result correctness — unit coverage, numeric precision and CI
tags: [research, results, validation, vitest]
status: complete
last_updated: 2026-10-19
last_updated_by: Codex
---

# Research: Result correctness

## Research Question

What remains to deliver Phase 1 of `context/foundation/test-plan.md`: independent checks of result arithmetic, signs, rounding, localized input, eight-decimal precision, unpriced positions and the date of the price used?

## Summary

The runner bootstrap is already implemented: Vitest is configured through Astro, `npm test` runs it, and the CI job invokes it on eligible pull requests and master pushes (`vitest.config.ts:1–10`, `package.json:18,61`, `.github/workflows/ci.yml:5–30`). The research run of `npm test` passed 27 tests across the three discovered test files. These cover wallets and capped service reads, rather than dedicated position-result and formatting contracts.

Position list, detail and confrontation share result description logic; wallet totals reuse the position amount calculation (`src/lib/result.ts:22–43`, `src/lib/wallet.ts:35–46`). Extend the existing test base instead of installing another runner. Numeric precision needs explicit treatment: converting the admitted decimal strings to JavaScript Number loses precision at large values (`src/lib/validation/decimal.ts:13–17`).

## Detailed Findings

### Arithmetic and display consumers

- `src/lib/result.ts:22–30` returns null if current price or price date is missing. Otherwise it computes percent from the price difference divided by buy price, amount from the difference multiplied by quantity, and carries the input price date. Null quantity removes amount without removing percent.
- `src/lib/result.ts:34–43` defines `No price yet` and the shared percent plus `as of` description.
- `src/lib/format.ts:6–10,49–50` formats percentages in en-US with two decimals and sign except rounded zero. Price/quantity formatting permits up to eight fractional digits (`:4,24–25`). Wallet amounts have two decimals (`:11–18,28–35`). Date-only values are explicitly UTC (`:19,39–40`); deleted timestamps use Warsaw separately (`:21,44–45`).
- List rows pass price, quantity and price date to the Astro component (`src/components/positions/PositionsTable.astro:62–67`). This table is mounted on dashboard and wallet detail (`src/pages/dashboard.astro:91`, `src/pages/dashboard/wallets/[id].astro:128`).
- Position detail passes the corresponding row fields (`src/pages/dashboard/positions/[id].astro:110–115`); its separate current-price section reads that row's date (`:155–159`). The common Astro component calls `describeResult` (`src/components/positions/PositionResult.astro:7,12–18`).
- React confrontation calls the same description and empty-price constant (`src/components/positions/ConfrontationPanel.tsx:50,64–70`). Testing shared text establishes the helper contract; it does not by itself prove rendered consumers retain their props and date markup.
- List, confrontation and detail reads select price/date together (`src/lib/services/positions.ts:64,87,104`); price mutation writes both together (`:123`). Database price/date pairing and positivity constraints are in `supabase/migrations/20261015094649_add_position_current_price.sql:13–20`.
- Wallet totals exclude positions without computed amount and take the oldest included price date (`src/lib/wallet.ts:35–46`). Wallet display uses the common amount, percent and date formatters (`src/components/wallets/WalletValue.astro:12–31`). Preserve the existing aggregate regression tests when adding direct result tests.

### Input parsing, date validation and precision

- `parseDecimal` strips whitespace and accepts comma or dot, with 1–12 integer digits and up to eight fractional digits, then returns Number (`src/lib/validation/decimal.ts:8–17`). Mixed separators, signs, exponents and nine fractional digits fail this grammar. Internal whitespace is removed as well: `1 2` becomes 12; this is observed behavior rather than a specified PRD requirement.
- Positive prices and nonblank quantities are enforced by the schema; blank quantity becomes null (`src/lib/validation/position.ts:23–46,73–85`). Test parser syntax separately from form positivity.
- Calendar validity uses a UTC round trip; today is UTC (`src/lib/validation/position.ts:18–20,57–68`). Price dates must be real, not future and not before buy date (`src/lib/validation/price.ts:11–20`). Freeze the clock for boundary tests.
- Precision counterexamples reproduced by the input researcher using Node: `Number('999999999999.99999999')` becomes `1000000000000`, outside numeric(20,8)'s integer capacity. The distinct admitted strings `999999999999.99999998` and `999999999999.99999999` become equal Numbers, so subtracting the former from the latter yields zero instead of positive 0.00000001. `Number('123456789012.12345678').toFixed(8)` yields `123456789012.12345886`. These are conversion findings, not database runtime probes.
- The loss continues into arithmetic (`src/lib/result.ts:27–28`), and generated database fields are typed as number (`src/db/database.types.ts:41–49`). A parser-only adjustment would not establish end-to-end exactness. SQL stores buy price/quantity as numeric(20,8) (`supabase/migrations/20260929141102_create_diary_core.sql:32–34`) and current price likewise (price migration `:13`).
- The PRD requires price/date inputs and optional quantity, result price dates, and the wallet formula (`context/foundation/prd.md:107,119,156,170`). The inspected PRD does not settle a numerical tolerance or rounding tie policy. Eight-decimal coverage and rounding edges are explicitly requested by `context/foundation/test-plan.md:63`.

### Existing test infrastructure and actual coverage

`vitest.config.ts:1–10` uses Astro `getViteConfig` and includes `src/**/*.test.ts`. The inspected test set is `src/lib/wallet.test.ts`, `src/lib/validation/wallet.test.ts`, and `src/lib/services/wallet-reads.test.ts`. Wallet tests already cover gain/loss, exclusions, oldest counted date, zero starting value and decimal aggregates; validation tests cover localized wallet starting values. Service tests use a fixture transport and real query builder, not a live RLS database.

During this research `npm test` ran Vitest 5.0.5 successfully: three files, 27 tests. This answers whether the existing runner works locally. No full lint/type/build verification, browser run, database test or remote CI run was performed; no application code was changed.

CI runs `astro sync`, tests, lint, Astro check and build (`.github/workflows/ci.yml:28–36`). Documentation-only paths are excluded (`:8–17`); smoke and wallet database checks run in the push job (`:38–66`). This research document does not prove GitHub branch protection requires that job.

The configuration matches Astro's documented `getViteConfig` integration: [Astro testing guide](https://docs.astro.build/en/guides/testing/#vitest), checked 2026-10-19. Vitest's [getting started guide](https://vitest.dev/guide/) documents its test runner; the locally executed version, rather than an inferred latest version, is the baseline here.

## Planning Handoff

1. Retain the runner and CI wiring. Add focused `result.test.ts`, `format.test.ts`, decimal parser and position/price schema coverage beside their modules.
2. Use independent literal expectations: buy 50, current 60, quantity 10 gives +20 percent and +100 amount; buy 100, current 80, quantity 2 gives -20 percent and -40 amount. Include unchanged prices, null quantity, absent price/date, and matching output price date.
3. Test positive/negative values on either side of rounding thresholds, rounded signed zero, eight-decimal prices/quantities, comma/dot equivalence, malformed inputs, UTC calendar boundaries, and exact display text. Do not calculate expected values with production helpers or a duplicate formula.
4. Resolve precision scope before declaring eight-decimal correctness. Options to assess in planning are preserving decimal values across parsing, transport and arithmetic, or explicitly agreeing a narrower supported range/tolerance. A test that accepts known digit loss would weaken the stated goal.
5. Preserve percent-only position display; amount remains a calculation contract used by wallets. Keep render/wiring verification distinct from pure-helper tests. Browser E2E is not necessary to exercise these arithmetic contracts.
6. Reconcile rollout documentation during the planned change: current §4's no-runner assertion is contradicted by the inspected config/tests; §3 points to `with-wallet`, absent from the inspected active/archive directories. The existing test-plan working-tree edit is user-owned and was left intact.

## Historical Context and Related Research

- **Supported:** `context/archive/2026-10-15-position-detail-and-price/change.md:23` explicitly overrides the earlier plan to percent-only display. Current `PositionResult.astro:9` agrees. Older amount-display acceptance text must not override this decision.
- **Partially superseded:** `context/archive/2026-10-19-named-wallets/plan.md:22` says CI omits unit tests; that was a planning observation, contradicted by current workflow `:30`. Its intended unit-test CI addition at `:112–120` is reflected in the inspected workflow. Its coverage criteria at `:94–97` explain the current wallet tests without establishing complete risk #1 coverage.
- `context/foundation/lessons.md` was read: its CI lesson about opening a PR remains relevant, but current docs-only exclusions also apply. UI select and migration-idempotency lessons do not change this unit-test scope.
- No separate named-wallets `research.md` was present at the inspected archive path; source code and its plan were used instead.

## Open Questions and Limits

- What precision/tolerance and decimal rounding policy should be guaranteed across the admitted numeric range? The current implementation cannot preserve eight fractional digits across that full range. Planning must make the decision explicit before choosing a correction.
- Render behavior and database transport exactness were traced statically, not executed. Hosted settings and branch-protection configuration are outside this research scope.

Evidence is from the local tree at the recorded commit plus existing uncommitted test-plan/change-document content. Anchors refer to inspected local files, not invented remote permalinks. Research made no product or implementation changes.
