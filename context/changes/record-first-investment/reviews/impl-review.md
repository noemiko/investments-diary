<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Record the First Investment

- **Plan**: context/changes/record-first-investment/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Notes: no DRIFT and no MISSING items. The EXTRA changes are all benign adaptations: `FormField` gained optional props, `decimal.ts` was split out, and ESLint and Prettier now ignore the generated types. No update or delete path exists in `src/`. Automated criteria re-run on 2026-09-29: types match, astro sync, lint, astro check and build pass, the smoke walk passes 21/21, and PR #1 CI (`ci` and `smoke`) is green. `db reset` was not re-run, to preserve local manual-test data; it passed earlier in the same session, including after the deliberate-break check.

## Findings

### F1 — "Today" is the UTC date, which rejects same-day entries just after local midnight

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation/position.ts:17 (todayUtc), src/components/positions/PositionForm.tsx (default + `max`)
- **Detail**: The plan says "Today for the future-date check is the server's current UTC date". The author is in Poland (UTC+1/+2). Between local midnight and 01:00/02:00, today's local date counts as "in the future", so the date picker's `max` blocks it and the server rejects it. That breaks the FR-003 entry for the case the form exists for: recording at the moment of buying. This is a flaw in the plan's decision, not drift.
- **Fix A ⭐ Recommended**: The server accepts `buy_date <= utcToday + 1 day`. The client computes its default and `max` from the browser's local date.
  - Strength: Covers every timezone up to UTC+14 with one line of server change, and the client shows the date the author actually sees.
  - Tradeoff: A date one day ahead of UTC can be saved (tomorrow in UTC-12). That's harmless for a diary.
  - Confidence: HIGH — the change is local to `todayUtc` callers and the island.
  - Blind spot: The smoke "future date" step must send UTC+2 days instead of +1.
- **Fix B**: Keep UTC and note the limitation under the plan's decisions.
  - Strength: No code change.
  - Tradeoff: A same-night entry fails for up to 2 hours a day, which works against the 60-second, record-at-buy-time NFR.
  - Confidence: MED — depends on how often the author trades after midnight.
  - Blind spot: None significant.
- **Decision**: SKIPPED — UTC "today" kept as planned
Stock is not open at 01:00 - 2:00. Crypto currency market can be open, but I don't see it is very necessary to complicate code with this edge case which is unlikely.

### F2 — Without JavaScript, a user who already has categories cannot create a new one

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/positions/PositionForm.tsx:140-182
- **Detail**: The `new_category_name` input only mounts in React state (`isNewCategory && …`). In the server-rendered HTML with at least one category, choosing "New category…" submits `category_id=__new__` and no name, and the server replies "Choose a category from your list". CLAUDE.md sets native POST forms that work without JS, with React validation only as polish. It works today with zero categories, because the server render starts in new-category mode.
- **Fix**: Always render the `new_category_name` input, hidden when JS is active and "new" isn't chosen. Have the server treat `category_id` of `__new__` (or empty) plus a non-empty name as a new category.
  - Strength: Restores the no-JS path the codebase promises, and keeps the "exactly one of" rule on the server.
  - Tradeoff: Slightly more branching in `readPositionForm` / the schema, and the island must hide the field without a flash.
  - Confidence: MED — the schema's exactly-one rule must be adjusted carefully so the error messages stay clear.
  - Blind spot: The smoke walk doesn't cover the no-JS new-category path, so this needs a new step.
- **Decision**: FIXED — select always posts category_id; "__new__" sentinel (NEW_CATEGORY_CHOICE) means no id on the server; name input always in SSR HTML, hidden after hydration (useSyncExternalStore); smoke covers the SSR input and the no-JS post

### F3 — A failed category read after a POST gives a 500 and loses the typed reason

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/new.astro:58
- **Detail**: `listCategories` throws on error. On the POST re-render, that becomes the platform's generic 500, and the reason text the author typed is gone. That goes against the no-silent-data-loss guardrail, though only on a transient DB failure.
- **Fix**: Catch the error in `new.astro` and render the form with `errors.form` and the submitted `values` (categories: `[]`).
- **Decision**: FIXED — new.astro catches a failed listCategories and re-renders with values and errors.form

### F4 — Out-of-range numbers show only a generic form error

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation/decimal.ts:8, supabase/migrations/20260929141102_create_diary_core.sql:32,34
- **Detail**: `numeric(20,8)` holds at most 12 integer digits and 8 decimals. `parseDecimal` accepts any length, so Postgres silently rounds past 8 decimals. `0.000000001` rounds to 0 and then fails the `> 0` check, and more than 12 integer digits raises error 22003. Both surface as a generic "could not be saved".
- **Fix**: Tighten the regex to `/^\d{1,12}(?:[.,]\d{1,8})?$/` so these become field errors.
- **Decision**: FIXED — parseDecimal limited to 12 integer digits and 8 decimals

### F5 — Unexpected save errors are not logged

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/positions.ts:96-98, 121
- **Detail**: Unexpected errors map to `unexpected` and nothing is written to the Vercel logs, so a production failure leaves no trace.
- **Fix**: `console.error` with `error.code` and `error.message` only. Never log `details`, because it contains the failing row, reason text included.
- **Decision**: FIXED — logUnexpected() logs code + message only, for unexpected save and category failures

### F6 — Pasted numbers with a non-breaking space are rejected

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation/decimal.ts:5
- **Detail**: `replaceAll(" ", "")` strips only U+0020. Broker pages formatted with `Intl` use U+00A0 or U+202F as the thousands separator, so a pasted `1 200,50` fails with "Enter a number like 50.25". It fails safely, but adds friction.
- **Fix**: `raw.replace(/\s/g, "")`.
- **Decision**: FIXED — parseDecimal strips all whitespace (\s), incl. non-breaking spaces

### F7 — `reason_text` can still be updated directly through PostgREST until S-07

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260929141102_create_diary_core.sql:64-66
- **Detail**: The update policy is owner-only, so no other account is affected. But the author's own session can PATCH `reason_text` through the REST API. The migration header states that the reason lock arrives in S-07, as the plan intended, so this is a documented, deferred gap.
- **Fix**: Accept for now. S-07 must close it with a trigger or column privileges, not only in application code.
- **Decision**: SKIPPED — reason lock stays deferred to S-07

### F8 — Smoke walk scrapes the category id out of the HTML

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:64-75
- **Detail**: It takes the last UUID within the 200 characters before the run-unique category name. If the markup changes it fails loudly, not silently: the `categoryId !== ""` check fails and the later B step fails too. This is the brittleness risk the plan brief named.
- **Fix**: Add a `data-category-id` attribute on each `<option>` and match on it, when the form next changes.
- **Decision**: FIXED — options carry data-category-id; smoke matches the option by exact text

### F9 — Plan bookkeeping: 3.2 met but not ticked, Phase 3 SHA and epilogue pending

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/record-first-investment/plan.md (Progress → Phase 3)
- **Detail**: PR #1's `smoke` job is green, but row 3.2 is still `- [ ]`. Rows 3.1 and 3.3 have no ` — ab75804` suffix, and the epilogue commit that flips `change.md` to implemented has not run, because the CI watch was interrupted.
- **Fix**: Tick 3.2, write the SHA `ab75804` into the Phase 3 rows, and run the epilogue commit, which resumes `/10x-implement`'s close-out.
- **Decision**: FIXED — 3.2 ticked (PR #1 CI green), Phase 3 SHA written, epilogue commit
