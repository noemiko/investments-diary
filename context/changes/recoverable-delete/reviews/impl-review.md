<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Recoverable Delete Implementation Plan

- **Plan**: context/changes/recoverable-delete/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 3 observations

Diff reviewed: `git diff --cached f8a7545` (S-02 merge → index). Phase 3 work is staged but not committed.
Automated checks run during review: verify sequence (astro sync, lint, astro check, build) passes;
`BASE_URL=http://localhost:4321 npm run smoke` passes 51/51 against this worktree's dev server;
regenerated `src/db/database.types.ts` matches the committed file byte for byte; no `supabase/` or
`package.json` change.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Smoke walk lacks the "restored detail page → 200" step

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:270-283
- **Detail**: Phase 3 contract: "After a restore, its detail page → 200; then delete it again so B's checks still hold." No step ever GETs `/dashboard/positions/<delPosition>` expecting 200. Without it, the two Phase 3 404 steps do not prove the 404 comes from the `deleted_at` filter — a detail page that 404s for every DEL position would pass. Progress 3.3 is checked regardless.
- **Fix**: After "A: cannot set a price on a deleted position", add: restore (302 /dashboard) → detail GET (200, includes `DEL-<runId>`) → delete again (302), all before the B section.
- **Decision**: FIXED — three steps added ("A: restores the deleted position again", "A: restored position's detail page opens", "A: deletes it once more"); smoke passes.

### F2 — Delete/restore not-found returns a bare plain-text page

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/positions/[id]/delete.ts:20-22, restore.ts:20-22
- **Detail**: `new Response("Position not found", { status: 404 })` renders as unstyled text with no way back. Reachable in normal no-JS use: double-clicking confirm Delete or Undo, Back + resubmit, restoring from a stale Deleted tab. The plan specified exactly this response, so it is a plan flaw implemented faithfully. The detail page (`[id].astro:72-100`) already renders a laid-out 404.
- **Fix A ⭐ Recommended**: Keep status 404 but render a minimal page with the Layout and a link back to /dashboard (same body for foreign and unknown ids).
  - Strength: Keeps the 404 contract the smoke walk and the plan rely on; matches the detail page's handling.
  - Tradeoff: Endpoints now render HTML (a small shared 404 component or an Astro page rewrite).
  - Confidence: HIGH — pattern already exists in `[id].astro`.
  - Blind spot: Haven't checked whether `context.rewrite("/404")` works cleanly from a POST endpoint on Astro 7.
- **Fix B**: Redirect `not_found` to `/dashboard?error=not_found` with a message in `ERROR_MESSAGES`.
  - Strength: Smallest change; double-submit lands the user somewhere useful.
  - Tradeoff: Loses the 404 status — six smoke steps and the plan's isolation contract would change to expect a 302.
  - Confidence: MED — simple, but weakens the "foreign id → 404" proof.
  - Blind spot: A redirect for a foreign id still leaks nothing, but the isolation evidence becomes less direct.
- **Decision**: FIXED (Fix A) — new gated `src/pages/dashboard/positions/not-found.astro` (status 404, Layout, link back); both endpoints `context.rewrite()` to it on non-uuid and `not_found`. Verify + smoke pass. Not rewritten to the detail page: an already-restored id would be processed as an empty price POST.

### F3 — Smoke 404 and isolation assertions are weaker than their names

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs ("A: deleting it again is not found", "B: cannot restore A's deleted position", "B: cannot delete A's position", "A: cannot set a price on a deleted position")
- **Detail**: These check only `status: 404`, so a routing 404 (empty id → `/dashboard/positions//delete`, renamed endpoint) passes too; "deleting it again" lacks even `requiresIds`. The B steps prove B got a 404, not that A's rows are unchanged — no later step re-checks A's Deleted page.
- **Fix**: Add `includes: ["Position not found"]` and `requiresIds` to the endpoint 404 steps, and in A's existing re-sign-in block assert `/dashboard/deleted` still lists `DEL-<runId>`.
- **Decision**: FIXED — `NOT_FOUND` constant; the four 404 steps now require the app's heading (and ids); new step "A: deleted position is still deleted" after B. Smoke passes.

### F4 — Phase 3 uncommitted; branch is behind origin/master with a roadmap conflict pending

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/foundation/roadmap.md:52-55; Progress 3.1-3.5
- **Detail**: Phase 3 code is staged but not committed, so Progress 3.x carries no SHAs. `origin/master` (a90402c) archived S-02 and set it to `done` on roadmap line 52; this branch's unstaged edit changes S-05 on line 55 and still shows S-02 `in-progress`. A rebase will conflict on those adjacent rows.
- **Fix**: Commit Phase 3, rebase onto `origin/master` (take S-02 `done`, keep S-05 `in-progress`), then append the SHA to 3.1-3.5.
- **Decision**: IN PROGRESS — Phase 3 committed as 7560386; review fixes commit + rebase + SHAs run at the end of triage.

### F5 — DeletedPositionsTable re-declares formatDate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/positions/DeletedPositionsTable.astro:14-20
- **Detail**: `dateFormat`/`formatDate` are byte-identical to `src/lib/format.ts`, which S-02 introduced as "one number and date format for the positions list, the detail page and the result" and which `PositionsTable.astro` imports. Likely a pre-rebase leftover.
- **Fix**: Import `formatDate` from `@/lib/format` and move `formatTimestamp` there next to it.
- **Decision**: FIXED — `formatTimestamp` moved to `src/lib/format.ts`; the component imports both. Lint + astro check clean.

### F6 — Every row's Delete controls share the same accessible name

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/positions/DeletePositionControl.astro:19-32
- **Detail**: Each row has a `<summary>` "Delete" and a confirm button "Delete"; in a screen reader's button list they are indistinguishable and don't name the position. Manual check 1.9 covered keyboard operability, not naming.
- **Fix**: Append `<span class="sr-only"> {instrument}</span>` inside the summary and the confirm button.
- **Decision**: FIXED — sr-only instrument name added to summary and confirm button; smoke row matching unaffected.

### F7 — Cancel uses an inline onclick despite "no JS"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/positions/DeletePositionControl.astro:34-40
- **Detail**: Cancel is an `<a href={cancelHref}>` (works without JS by reloading) enhanced with an inline `onclick` that closes `<details>` in place. Progressive enhancement, not an island, and the comment explains it — but the plan said "no JS". The `cancelHref` prop is a benign unplanned addition.
- **Fix**: Note it in the plan as an addendum; no code change.
- **Decision**: FIXED — `## Addenda` added to plan.md (also records the F2 not-found contract change).

### F8 — Action errors land on a different page from where the user acted

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/positions/[id]/restore.ts:23; DeletePositionControl.astro:11
- **Detail**: A failed restore from `/dashboard/deleted` redirects to `/dashboard?error=restore_failed`; `deleted.astro` reads no `?error=`. Likewise a no-JS Cancel on the dashboard reloads `/dashboard` without `?deleted=`, dropping a visible Undo notice.
- **Fix**: Leave as is for MVP; revisit if a `return` target is ever needed.
- **Decision**: ACCEPTED — left as is for the MVP.

### F9 — Unbounded deleted list and app-clock deleted_at

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/positions.ts:112-118, 143
- **Detail**: `listDeletedPositions` has no limit (like `listPositions`), and `deleted_at` comes from `new Date()` on the app server rather than the DB's `now()`. Both harmless for a single-user diary.
- **Fix**: None now; add `.limit()`/paging if the deleted list grows.
- **Decision**: DEFERRED — both parts queued in `follow-ups/review-fixes.md` (F9a limit, F9b DB-clock `deleted_at`).
