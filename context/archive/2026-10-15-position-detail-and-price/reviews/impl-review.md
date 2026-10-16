<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Position Detail and Current Price

- **Plan**: context/changes/position-detail-and-price/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Notes:

- **Plan Adherence:** every planned change has the verdict MATCH. The percent-only result display is an approved deviation, recorded in change.md.
- **Scope Discipline:** two files changed outside the plan, both benign and documented. `fixtures.ts` was needed because the DTO gained fields. `roadmap.md` holds the S-02 status flip.
- **Success Criteria:** these were re-run on HEAD and pass:
  - sync, lint, astro check and build
  - the types regenerate with no diff
  - the smoke walk, against the worktree's server on :4322
  - PR #10 `ci`
- **Manual checks:**
  - 1.6, 2.3–2.8 and 3.3 were confirmed by the author.
  - 3.4: PR #10 exists.

## Findings

### F1 — A price POST is silently dropped when the position read fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/positions/[id].astro:40-52
- **Detail**: If `getPosition` throws on a POST, `state` becomes `load_failed` and the `position && POST` block is skipped. The page then shows only the generic "could not be loaded" state. The author is never told that the price they just submitted was not saved, and the typed values are lost. `new.astro` keeps the typed values on a read failure. Here the read is a precondition, because `buy_date` is needed for validation, so the values cannot simply be re-rendered.
- **Fix**: When the request is a POST and `state === "load_failed"`, add a sentence to the error copy: "Your price was not saved. Please try again."
- **Decision**: FIXED

### F2 — plan.md still describes the amount display

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/position-detail-and-price/plan.md (Desired End State, Phase 2 §3, Manual Verification, Testing Strategy step 2)
- **Detail**: The percent-only decision is recorded in change.md, but the plan text still promises ` · +100`. A reader of the archived plan who skips change.md would expect an amount.
- **Fix**: Add a one-line "Amended 2026-10-15: result is percent-only, see change.md" note under Phase 2 §3. Phase blocks are read-only only while implementation is running, so this is allowed now.
- **Decision**: FIXED

### F3 — `result.ts` uses an `_input` parameter name and truthy null checks

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/result.ts:21-22
- **Detail**: A leading `_` conventionally means "unused", but the parameter is used throughout. It is left over from the stub. `!current_price` would treat 0 as "no price". That is safe only because the database check requires a price above 0.
- **Fix**: Rename the parameter to `input`, and use `input.current_price === null || input.price_date === null`.
- **Decision**: FIXED

### F4 — The percent formatter lives outside the shared format module

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/positions/PositionResult.astro:11-15
- **Detail**: The header of `src/lib/format.ts` says it is the one place for number and date formats. `PositionResult` builds its own `Intl.NumberFormat`, once per render, which means once per table row. S-03 will want the same percent format.
- **Fix**: Move it into `format.ts` as `formatPercent(value)`, and import it in `PositionResult.astro`.
- **Decision**: FIXED

### F5 — The price date's default and its "future" limit use the UTC day

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/positions/[id].astro:49, src/lib/validation/price.ts:19
- **Detail**: East of UTC just after local midnight, the author's real today is rejected as being in the future. West of UTC in the evening, the default date is the author's tomorrow. `buy_date` in `new.astro` behaves the same way, so this matches the existing code and is not a regression.
- **Fix**: Accept it as a known limitation for now. If it starts to bite, fix it for both forms together in one change.
- **Decision**: ACCEPTED — known limitation, consistent with buy_date in new.astro; fix both forms together if it bites

### F6 — The migration's `if not exists` is only half idempotent

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261015094649_add_position_current_price.sql:12-20
- **Detail**: The columns use `add column if not exists`, but the two `add constraint` statements cannot. Re-applying the file fails. The migration is already applied in production, so editing it now would make it differ from what production ran.
- **Fix**: Leave it as is, because it is already applied in production. Use plain `add column` in future migrations.
- **Decision**: ACCEPTED-AS-RULE: Don't half-guard migrations with `if not exists`

### F7 — The smoke walk does not compare the foreign-id and missing-id 404 bodies

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs (404 steps)
- **Detail**: Both return 404, and B's response leaks none of A's data. But nothing proves the two responses are identical, which is the plan's "never reveals whether an id exists" property. A soft-deleted position is not covered either; that is deferred to S-05 by design.
- **Fix**: Optionally, assert that B's 404 body for A's id equals the 404 body for a random uuid.
- **Decision**: FIXED

### F8 — The instrument link in the list is visible only on hover

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/positions/PositionsTable.astro:45
- **Detail**: The link is styled `hover:underline` only. During manual testing the author did not find the detail page. It cannot be discovered on touch devices.
- **Fix**: Give it an always-visible link style, e.g. `underline underline-offset-4`.
- **Decision**: FIXED
