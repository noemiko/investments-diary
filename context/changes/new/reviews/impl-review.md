<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Investment Diary login page

- **Plan**: context/changes/new/plan.md
- **Scope**: Automated-complete phases 1–2; supplemental review of unfinished Phase 3 work
- **Reviewed phases**: 1, 2
- **Supplemental phase**: 3 (in progress; no completion or archive-acceptance claim)
- **Date**: 2026-11-20
- **Verdict**: REJECTED — current automated verification fails
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS for phases 1–2; Phase 3 incomplete |
| Scope Discipline | PASS |
| Safety & Quality | PASS — no confirmed production defect found |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL — lint and targeted browser regressions |

## Findings

### F1 — Pending-navigation tests cannot finish their assertions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/e2e/login.spec.ts:136; related pending screenshot flow at lines 232–244
- **Detail**: The native POST response is deliberately held at line 122, but the duplicate-submission step awaits `form.evaluate()` before releasing it at line 147. The fresh review run times out after 30 seconds at line 136. The response and actual history-restoration assertions are never reached. The desktop and tablet pending screenshot tests also timed out, with cleanup reporting a closed page at line 244. Prior implementation runs captured all twelve screenshots, so screenshot completion is unstable rather than consistently missing. Progress row 3.3 is correctly unchecked. These failures do not establish a production duplicate-submission defect; they leave that contract unverified.
- **Fix**: Separate pending-document observation from operations that wait for native navigation, and release held responses in unconditional cleanup. Retain actual credential submission, the one-request assertion, disabled-button/enabled-input checks and real browser-history/password-clearing assertions.
  - Strength: Restores the planned regression evidence without weakening behavior assertions.
  - Tradeoff: Requires reasoning about browser navigation and Playwright synchronization rather than increasing timeouts.
  - Confidence: HIGH — the fresh run identifies the blocked step and ordering directly.
  - Blind spot: History restoration cannot be certified until the test reaches its final assertions.
- **Decision**: PENDING

### F2 — The new form-handle guard fails repository lint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/login.spec.ts:111
- **Detail**: `if (!form)` is statically always false for the inferred handle type. `npm run lint` fails with `@typescript-eslint/no-unnecessary-condition`. This latest Phase 3 edit postdates the earlier successful static run; the current working tree does not pass the prescribed static bar. Pre-commit runs whole-repository lint, so this also blocks a normal commit.
- **Fix**: Remove the redundant null guard or use a handle-acquisition API whose declared nullability matches the intended check; preserve the runtime form-type assertion in the callback.
- **Decision**: PENDING

## Verification

Fresh checks run with the pinned Node 24.21.0 runtime against local services only:

- `npm test`: PASS — 40 files, 548 tests.
- `npx astro sync`: PASS.
- `npm run lint`: FAIL — one error at tests/e2e/login.spec.ts:111.
- `npx astro check`: PASS — 183 files, zero errors, warnings or hints.
- `npm run build`: PASS. Check and build were run after the lint failure to collect independent evidence; the complete static sequence is still failed.
- `BASE_URL=http://127.0.0.1:4321 npm run smoke`: PASS — including generic error rendering, dashboard returns, cross-origin POST rejection, cookie policy, refresh, signout and cross-account isolation.
- Targeted Playwright auth/session run: FAIL — 12 passed, 3 failed (native duplicate submission/history, desktop pending-state capture and tablet pending-state capture), 1.4 minutes.

Actual lint output:

```text
tests/e2e/login.spec.ts
  111:7  error  Unnecessary conditional, value is always falsy
  @typescript-eslint/no-unnecessary-condition
```

Actual browser failure excerpt:

```text
native POST sends credentials once and history restores an idle empty password
  reject repeated submissions while the original POST is pending
Test timeout of 30000ms exceeded.
Error: elementHandle.evaluate: Test timeout of 30000ms exceeded.
  tests/e2e/login.spec.ts:136:18
```

## Evidence and scope

- Feature commits: 74cbaf2 (presentation), 76737f9 (form behavior and server security).
- Phase 3 tests and smoke changes are uncommitted. No phase 3 commit or final implementation epilogue exists.
- Both independent source reviews found phases 1–2 consistent with the plan: static illustrative preview, local Inter/OFL, scoped theme, native POST, accessible descriptions/focus, fixed errors, server-validated dashboard returns, and explicit Supabase cookie options retaining storage/chunking/lifetime behavior.
- Existing shared form helper callers retain compatibility. Server getUser authorization and ownership enforcement remain in place. No migrations, global native-control scheme, public signup, client auth dependency or cloud deployment was introduced.
- Real successful PKCE callback remains unit-covered; callback failure is covered over HTTP. Screen-reader acceptance remains pending.
- Unrelated pre-existing context/domain deletions and homework/ are excluded from this change review and were not staged or modified.
- No implementation fixes, staging or commits were performed during this review. Only this report and the required change lifecycle stamp were written.

## Pending manual verification

- [ ] 1.2 Desktop, tablet and mobile layouts show the required content without clipping or horizontal scrolling.
- [ ] 2.3 Keyboard submission, invalid-field focus, error announcements, password visibility and pending feedback work without disrupting native POST navigation.
- [ ] 3.4 Screenshots confirm the agreed design, readable contrast, visible focus, reduced-motion behavior and comfortable mobile controls.
- [ ] 3.5 Screen-reader review confirms labels, validation descriptions and failure announcements.
