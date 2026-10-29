<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Wallet performance dashboard

- **Plan**: context/changes/wallet-performance-dashboard/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Overlapping hit areas select the wrong day

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/wallets/WalletTimeline.tsx:129-144
- **Detail**: Transparent radius-10 circles are painted in ascending date order. On dense flat history, later circles cover earlier point centers. Pointer/touch selection therefore reports a later observation rather than the nearest visible point. The current browser test has only three sparse points and taps the final point.
- **Fix**: Resolve the nearest observation from pointer coordinates on the SVG; retain individual keyboard-focusable points. Add a mobile dense-flat-history test tapping an interior date.
  - Strength: Deterministic selection regardless of SVG painting order.
  - Tradeoff: Requires converting pointer coordinates into SVG space.
  - Confidence: HIGH — overlap follows directly from point spacing and hit radius.
  - Blind spot: Dense interaction was established by static inspection, not reproduced in the browser run.
- **Decision**: FIXED — nearest-time-axis pointer selection on SVG; keyboard selection retained. Added 365-point flat mobile history coverage for interior touch, hover and keyboard selection. Verified 2026-10-29: astro sync, lint, astro check, build, 282 unit tests, and wallet Playwright test (2 including setup) passed.

### F2 — Responsive sizing stops after the SVG mounts again

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/wallets/WalletTimeline.tsx:14-24
- **Detail**: The ResizeObserver effect runs only once. An empty default range has no SVG, so choosing All later mounts an unobserved SVG. Switching a populated range to an empty range and back also replaces the observed node. Width remains stale and mobile targets scale down.
- **Fix**: Observe a persistent wrapper or use a callback ref that reconnects the observer when the SVG changes; test empty-to-populated and populated-to-empty-to-populated ranges on mobile.
- **Decision**: FIXED — observer now watches the persistent history section. Mobile browser coverage verifies initially empty default range → All, populated → empty → populated, and viewport resizing. Verified 2026-10-29: astro sync, lint, astro check, build, 282 unit tests and wallet Playwright tests (2 including setup) passed.

### F3 — Demo zero-price sale is never counted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/demo/lib/demo-data.mjs:31-48
- **Detail**: Phase 3 requires a zero-sale scenario. Only index 0 has sell_price zero, but it also has null quantity and a deletion timestamp, excluding it from totals. Manual demo testing cannot exercise an active zero-price realised loss.
- **Fix**: Give an active closed position with quantity (for example index 4) a zero sale price and assert its complete realised loss in fixture tests.
- **Decision**: FIXED — moved zero sale to active position index 4; asserted quantity, active/closed state, six counted realised positions and exact realised total zero (five gains of 100 minus loss of 500). Verified 2026-10-29: demo database tests (2), astro sync, lint, astro check, build and 282 unit tests passed. Existing persistent demos retain their previous fixtures until an explicit reset.

### F4 — Manual completion claims contradict verification evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/wallet-performance-dashboard/verification.md:3
- **Detail**: Verification says human signoff remains pending while Progress items 2.3, 3.2 and 4.3 are checked. Browser evidence covers a sparse disposable account, not the five seeded scenarios. It does not prove the claimed demo sign-in and seeded desktop/mobile acceptance.
- **Fix**: Reopen unverified manual acceptance items and reconcile the verification notes; mark them complete only after recording concrete evidence.
- **Decision**: FIXED — reopened Progress manual checks 2.3, 3.2 and 4.3 and documented pending human acceptance separately from passing automated evidence (2026-10-29).

### F5 — Timestamp details omit stored precision

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/wallets/WalletTimeline.tsx:7-10
- **Detail**: Phase 2 specifies exact timestamps, but timeStyle short omits seconds and fractions in point details and the observation table. A capture at 00:00:59 appears as 00:00.
- **Fix**: Expose the complete stored UTC timestamp in details/table, optionally keeping short timestamps in the heading.
- **Decision**: SKIPPED — user chose to retain the current timestamp display (2026-10-29).

## Verification evidence

Checks ran on 2026-10-28; report finalized on 2026-10-29.

- `npx astro sync`: PASS, generated types.
- `npm run lint`: PASS.
- `npx astro check`: PASS, 130 files, 0 errors/warnings/hints.
- `npm run build`: PASS, Vercel server build complete.
- `npm test`: PASS, 282 tests in 24 files.
- `npm run test:decimal-db`: PASS, 11 tests in 2 files, including signed snapshot transport/pagination/isolation.
- `npm run test:snapshots-db`: PASS, exact totals, concurrent daily idempotency, RLS/write restrictions and immutable history.
- `npm run test:demo-db`: PASS, 2 tests.
- `npm run test:wallet-cron`: PASS, midnight UTC singleton registration and permissions, rolled back.
- `npm run test:close-db`: PASS, fresh chain and existing position constraints/isolation.
- `npx playwright test tests/e2e/wallet-dashboard.spec.ts`: PASS, 2 tests including setup; ranges, exact details, reload, keyboard/touch and no-JS.
- `BASE_URL=http://127.0.0.1:4321 npm run smoke`: NOT VERIFIED; tool call interrupted by user.

Initial database attempt was blocked by the sandbox, then passed with approval. The initial browser run collided with a concurrent build and failed with ENOENT for dist/server/entry.mjs; the sequential rerun passed. These were verification-environment failures, not implementation findings.

No production migration or deployment performed. No implementation fixes made during review. Change scope is the working-tree diff and untracked feature files on top of 4b6b115; no feature commit range exists yet. Architecture, existing pagination/error-reporting patterns, restricted capture, and owner isolation match the plan.

## Triage complete (2026-10-29)

- Fixed: F1, F2, F3, F4.
- Skipped: F5 (timestamp precision).
- No pending triage decisions remain. The original review verdict and reviewed-phase coverage are preserved as the historical review result.
- Manual acceptance checks 2.3, 3.2 and 4.3 remain pending; the interrupted HTTP smoke rerun remains unverified.
