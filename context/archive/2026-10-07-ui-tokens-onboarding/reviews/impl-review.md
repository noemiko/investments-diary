<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard na tokenach (ui-tokens-onboarding)

- **Plan**: context/changes/ui-tokens-onboarding/plan.md
- **Scope**: Phases 2, 3 of 3 (Phase 1 covered by reviews/impl-review-phase-1.md; Phase 3 included at user request while its manual rows are pending)
- **Reviewed phases**: 2, 3
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automated: `npx astro sync && npm run lint` PASS, `npx astro check` 0 errors, `npm run build` PASS. Palette grep (with /usr/bin/grep): only `bg-cosmic` at dashboard.astro:17 and kitchen-sink.astro:39 (approved Q4). DEV guard at kitchen-sink.astro:16. Production `/dev/kitchen-sink` → 404.

## Findings

### F1 — Palette-grep criteria 2.2 / 3.4 can't pass as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ui-tokens-onboarding/plan.md:250 (and Phase 3 criterion 4)
- **Detail**: Under the Claude Code shell, `grep` is ugrep, which rejects `(white|black)(/|\b)` and exits 2 with empty stdout, which reads as "returns nothing". With /usr/bin/grep the pattern matches the Q4-approved `bg-cosmic`, so the criterion can never return nothing. Both rows are ticked [x]. The code is clean; the check is wrong.
- **Fix**: Add a note under the Progress rows (Phase blocks stay read-only) recording the run with /usr/bin/grep, bg-cosmic excluded per Q4, and the only matches.
- **Decision**: FIXED — evidence note added under ## Progress in plan.md (Phase blocks untouched)

### F2 — Dashboard has no error state; kitchen sink says it doesn't apply

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:13, src/pages/dev/kitchen-sink.astro:100-106
- **Detail**: `listPositions` throws on a Supabase error (positions.ts:50). dashboard.astro:13 doesn't catch it and there is no 500.astro, so the author gets Astro's generic 500 with no sign-out link. dashboard/new.astro:58-64 already catches a failed read. Predates the change (Phase 2 kept data fetching unchanged), but the kitchen sink declares error "not applicable", so the change's state inventory is wrong.
- **Fix A ⭐ Recommended**: Catch the error in dashboard.astro, render an error message inside the Card (copy like new.astro's), and add an "error" section to the kitchen sink.
  - Strength: Completes the change's own goal of covering every named state; reuses new.astro's pattern.
  - Tradeoff: About 10 lines in a phase that said "data fetching unchanged"; 3.8 needs a new screenshot.
  - Confidence: HIGH — pattern already in repo, one call site.
  - Blind spot: Error copy is a product decision; would reuse new.astro's wording.
- **Fix B**: Correct the kitchen-sink copy and record "error state" as deferred in charges.md for S-02.
  - Strength: No code change; strict scope.
  - Tradeoff: Production keeps the bare 500 until S-02.
  - Confidence: HIGH.
  - Blind spot: S-02 has no date.
- **Decision**: FIXED via Fix A — dashboard.astro catches listPositions and renders new PositionsErrorState.astro (token classes, Try again link); kitchen sink gains an error section and corrected copy; kitchen-sink screenshots re-taken (1280px, 390px)

### F3 — The positions list is cut off silently at max_rows

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/positions.ts:44-49
- **Detail**: No `.range()` or limit; PostgREST caps at max_rows (1000 locally, supabase/config.toml:18), so a longer list is cut off silently. Predates the change; unrealistic soon for a single-user diary.
- **Fix**: Add to charges.md → Deferred ("list > max_rows, pagination").
- **Decision**: FIXED — added to charges.md → Deferred

### F4 — Phase 3 manual checks 3.5–3.9 not yet confirmed

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md ## Progress, Phase 3 Manual
- **Detail**: Evidence exists for all: prod `/dev/kitchen-sink` → 404; screenshots 1280/390px (sips) linked in charges.md; checklist and Deferred sections filled. Awaiting human confirmation. 3.8 depends on F2 (Fix A needs a new screenshot).
- **Fix**: Confirm 3.5–3.9, then tick them and add the commit ID.
- **Decision**: FIXED — manual checks 3.5–3.9 confirmed by the author 2026-10-15 (3.5 checked on production, not a preview)

### F5 — Small cosmetic additions not described in the plan

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: PositionsTable.astro:23, dashboard.astro:18, kitchen-sink.astro:43-45, :95-96
- **Detail**: `hover:bg-transparent` on the header row, `min-w-0` on the Card, kitchen-sink intro paragraph and extra Badge variants; empty-state Card nested in the dashboard Card. Intent unchanged.
- **Fix**: No action needed; acknowledge.
- **Decision**: ACCEPTED — cosmetic, intent unchanged
