# Past Investment Reasons — Implementation Plan

## Overview

Add a focused browser regression test proving that previous investment reasons appear during investment creation, then run it on qualifying PRs and master pushes.

The user declined additional privacy tests because existing coverage already protects those boundaries. Preserve that decision and the accepted financial-testing omissions.

## Current State Analysis

The creation page preloads eligible history into a hydrated form. Category changes filter that history synchronously. Existing browser creation coverage selects a category but does not inspect earlier reasons.

SQL, PostgREST and HTTP tests already cover ownership and several history cases. Playwright is configured, but its existing Chromium project depends on shared account setup.

### Key Discoveries

- The independent behavioral oracle is PRD US-01: own matching investments, reasons and results appear **before saving**, with an explanatory empty state.
- The panel exposes an accessible name and record identifiers suitable for focused assertions.
- Existing fixture patterns create disposable local accounts and valid stock-selection receipts without provider calls.
- A separate Playwright project can run this scenario without the shared auth setup. [Playwright project selection](https://playwright.dev/docs/test-projects)

## Desired End State

A deterministic browser test fails when the hydrated creation flow stops showing matching reasons, leaves the previous category’s history visible, or loses its empty state. A dedicated CI job executes this scenario using local Supabase and Chromium.

No public API, database schema, application type or product behavior changes are planned.

## What We’re NOT Doing

- Adding privacy tests or strengthening the foreign-wallet attempt.
- Running the full browser suite in CI.
- Reopening accepted financial or snapshot-testing omissions.
- Adding visual snapshots, long-reason expansion coverage, new unit tests or agent hooks.
- Changing hosted settings, branch protection or deployment configuration.

## Implementation Approach

Use the real application page, local database and request-cookie authentication. Seed historical records directly through existing fixture conventions; do not mock history, rendering or category selection.

The principal changed files are the new `tests/e2e/decision-history.spec.ts`, `playwright.config.ts`, and `.github/workflows/ci.yml`. Update the foundation test guide after verification.

## Phase 1: Protect past-reason display

### Changes Required

**Browser scenario and fixture**

**Intent:** Protect the missing hydrated interaction using distinctive, independently specified history.

**Contract:** The new spec owns a disposable confirmed account, one USD wallet, categories A/B/Empty, valid selection receipts and four earlier records:

| Record         | Category | Facts                                     | Expected observation                                 |
| -------------- | -------- | ----------------------------------------- | ---------------------------------------------------- |
| Open           | A        | Buy 100, current 120, quantity 2, no fees | Distinct written reason, `+20.00%`, quote date       |
| Closed         | A        | Buy 100, sell 90, quantity 2, no fees     | Different written reason, `Final -10.00%`, sale date |
| Other category | B        | Buy 50, current 55, quantity 2, no fees   | Third written reason, `+10.00%`, quote date          |
| Deleted        | A        | Soft-deleted, distinctive reason          | Absent from the panel                                |

Use fixed past dates and literal expected text; production formatting/calculation helpers must not generate assertions.

The scenario must:

1. Sign in through the real endpoint using the disposable account.
2. Open the creation page and wait for hydration.
3. Select A; assert exactly the two eligible record identities, their visible reasons, results and dates within the named panel.
4. Select B; assert its record appears and A’s entries disappear.
5. Select Empty; assert the explanatory message and no history entries.
6. Compare the owner’s saved position records before and after interaction to prove selection created or modified nothing.

Use short reasons, avoiding clamping behavior. Do not press Save, search listings or download prices. Delete the disposable account in `finally`, including partial-setup failures; cleanup failures must fail the test.

**Isolated Playwright project**

**Intent:** Make the scenario runnable without persistent E2E credentials.

**Contract:** Add a Chromium project named `decision-history`, matching only the new spec, with empty storage state and no setup dependency. Exclude that spec from the existing Chromium project to prevent duplicate execution. Preserve existing shared-auth behavior for other specs.

Focused command:

```sh
npx playwright test --project=decision-history
```

### Success Criteria

#### Automated Verification

- The focused scenario passes twice consecutively without shared E2E credentials, fixture collisions or cleanup failures.
- Test discovery selects only the new scenario for `decision-history`; existing Chromium specs retain their setup dependency.
- Temporarily removing the form’s confrontation-panel rendering makes the scenario fail on missing history; restore the source and confirm the scenario passes.

## Phase 2: Add focused PR protection

### Changes Required

**CI job**

**Intent:** Detect history-display regressions before merge without expanding CI to unrelated browser specs.

**Contract:** Add `decision-history` to the existing CI workflow, inheriting its qualifying PR/master triggers and docs-only exclusions.

The job will:

- Use the repository’s Node version, dependency-install authentication and Supabase CLI pin.
- Install Chromium and its operating-system dependencies.
- Start local Supabase using the existing CI exclusions.
- Derive application configuration from local Supabase status without printing credentials.
- Run Astro sync and the focused Playwright command; let the existing web-server configuration perform build-then-dev serving.
- Retain the current single-worker and retry behavior in CI.
- Upload browser reports and failure diagnostics with seven-day retention.
- Stop local Supabase in an unconditional cleanup step.

Use a 20-minute job timeout. The scenario creates its own account; no hosted backend or persistent E2E account credentials are required. Keep existing CI jobs intact. Browser installation and report collection follow the [official CI guidance](https://playwright.dev/docs/ci-intro).

### Success Criteria

#### Automated Verification

- The CI-equivalent local invocation passes with local configuration and shared E2E credentials absent.
- Changed files pass targeted formatting checks and `git diff --check`.

#### Manual Verification

- A PR run shows the focused job passing and selecting the history scenario; failure diagnostics and unconditional cleanup are present in the workflow.

## Phase 3: Verify and document shipped protection

### Changes Required

**Foundation test guide**

**Intent:** Record actual execution and the latest user decisions.

**Contract:** Update the guide’s rollout, gates, browser cookbook and freshness entries:

- Document the focused command, disposable setup and configured CI job.
- Record that additional privacy tests were explicitly declined in favor of existing protection.
- Mark the private-decision-history phase complete only after its verification criteria pass.
- Credit the focused browser gate without marking unrelated hosted evidence or hook work complete.
- Preserve accepted omissions and existing exclusions.
- Distinguish local results, remote results and unverified branch protection.

Do not edit the E2E-owned `test-stack.md` as part of this change.

### Success Criteria

#### Automated Verification

- Repository checks pass in the required order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`; `npm test` also passes.
- Documentation formatting and diff checks pass; recorded commands, scope and completion claims agree with actual results.

## Testing Strategy

The browser test covers the real page-to-island interaction, category membership, visible written reasons, independent result values and true empty history. Existing lower-layer privacy tests remain the protection for ownership and serialized data.

The deliberate-break check proves that the new scenario detects missing panel wiring. Repeated focused runs check fixture isolation and cleanup. No broad database rerun is required unless implementation unexpectedly changes production numeric, schema, policy or grant code; such a change requires revisiting scope.

## Performance Considerations

The additional job runs one Chromium scenario. Fixture setup uses local database operations and no market provider requests.

## Migration Notes

No migration or production-data change. Reverting the test, project, workflow and corresponding documentation removes this addition.

## References

- Accepted change notes and research in `context/changes/test-plan-refresh-2026-11-20/`.
- PRD US-01 and FR-012.
- Existing investment-persistence fixture, hydration helper and local-Supabase CI patterns.
- Foundation test guide and repository verification instructions.

## Progress

### Phase 1: Protect past-reason display

#### Automated

- [x] 1.1 The focused scenario passes twice consecutively without shared E2E credentials, fixture collisions or cleanup failures.
- [x] 1.2 Test discovery selects only the new scenario for `decision-history`; existing Chromium specs retain their setup dependency.
- [x] 1.3 Temporarily removing the form’s confrontation-panel rendering makes the scenario fail on missing history; restore the source and confirm the scenario passes.

### Phase 2: Add focused PR protection

#### Automated

- [x] 2.1 The CI-equivalent local invocation passes with local configuration and shared E2E credentials absent.
- [x] 2.2 Changed files pass targeted formatting checks and `git diff --check`.

#### Manual

- [ ] 2.3 A PR run shows the focused job passing and selecting the history scenario; failure diagnostics and unconditional cleanup are present in the workflow.

### Phase 3: Verify and document shipped protection

#### Automated

- [x] 3.1 Repository checks pass in the required order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`; `npm test` also passes.
- [x] 3.2 Documentation formatting and diff checks pass; recorded commands, scope and completion claims agree with actual results.
