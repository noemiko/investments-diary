# Recoverable Delete Implementation Plan

## Overview

The author can delete a position after an explicit confirmation, undo it immediately, and
restore it later from a Deleted positions page. Deleted positions disappear from the list (and,
once S-03 lands, from the confrontation) but are never destroyed. This is roadmap slice S-05
(FR-009; NFR "no entry disappears without the author confirming it, and any removed entry can be
restored").

Runs in parallel with `position-detail-and-price` (S-02) in a separate worktree; see
`context/changes/recoverable-delete/change.md`. S-02 merges first. Phases 1–2 are independent of
S-02; Phase 3 runs only after S-02 has merged and this branch has rebased onto it.

## Current State Analysis

- `positions.deleted_at timestamptz` already exists and there is no delete policy
  (`supabase/migrations/20260929141102_create_diary_core.sql:39,71`). The owner-only update policy
  (`:68-69`) permits setting and clearing `deleted_at`. **No migration is needed.**
- RLS `positions_select_own` checks only ownership, so deleted rows stay readable to their owner —
  that is what makes a Deleted page possible, and why every query must filter on `deleted_at` itself.
- `listPositions` (`src/lib/services/positions.ts:44-56`) already excludes deleted rows; nothing
  else reads positions yet.
- `/dashboard` (`src/pages/dashboard.astro`) shows `PositionsEmptyState` when the list is empty, so
  after deleting every position nothing on the page would lead to restore today.
- Gating is by path prefix: `PROTECTED_ROUTES = ["/dashboard"]` in `src/middleware.ts:4`.
- UI primitives available: `badge`, `button`, `card`, `table`. No dialog component.

## Desired End State

- Each list row has a Delete control that expands in place (native `<details>`, no JS) to
  "Delete <instrument>? [Delete] [Cancel]". Only the confirm button deletes.
- After deleting, `/dashboard` shows "Position deleted." with an Undo button (restores at once) and
  a link to Deleted positions.
- `/dashboard/deleted` lists the author's deleted positions, most recently deleted first, with
  instrument, category, buy date, deleted date and a Restore button; an empty state otherwise.
- The dashboard header always links to Deleted positions, so restore stays reachable when every
  position is deleted.
- A foreign, unknown or wrong-state id on delete or restore gets 404 and changes nothing.
- After Phase 3: the detail page (from S-02) has the same Delete control; a deleted position's
  detail page is 404 and its price update is refused.

### Key Discoveries:

- An update the RLS `using` clause hides affects zero rows without error, so "zero rows" is the
  not-found signal for foreign, unknown and already-in-the-target-state ids alike.
- A non-uuid id reaching PostgREST raises `22P02`; endpoints must reject it before querying.
- S-02 creates `src/pages/dashboard/positions/[id].astro`; Astro serves it next to
  `src/pages/dashboard/positions/[id]/delete.ts`, so the two branches add no conflicting files.
- S-02's smoke steps reprice the first smoke position; this change's smoke steps must use their
  own position so the merged walk stays coherent.

## What We're NOT Doing

- Hard delete or automatic purge: a deleted position stays restorable forever (FR-009).
- A confirmation step for restore — restoring destroys nothing.
- Deleting or restoring categories (S-08).
- A modal or any new client-side island; no new dependency.
- The confrontation's exclusion of deleted positions — S-03 is not built; it must reuse the
  `deleted_at is null` filter (recorded under Critical Implementation Details).
- Before Phase 3: anything on the detail page, which does not exist on this branch.

## Implementation Approach

No schema work. Two POST-only endpoints under `/dashboard/positions/[id]/` do the soft delete and
the restore through the request-scoped, RLS-bound client and answer with redirects, like the auth
form POSTs. The list row gets a no-JS inline confirmation, the dashboard a notice with Undo, and a
new page lists deleted positions. The smoke walk proves the round trip and two-account isolation.
The last phase waits for S-02 and closes the coordination check on the detail page.

## Critical Implementation Details

- **Undo notice from the URL:** `/dashboard?deleted=<id>` is only a hint. The notice renders only
  for a well-formed uuid, and Undo POSTs to the restore endpoint, which enforces ownership and state;
  a forged id therefore yields a 404 on Undo and exposes nothing.
- **Hand-off to S-03:** the confrontation must select positions with `deleted_at is null`, exactly
  like `listPositions`. Note this in S-03's plan when it is written.
- **Merge conflicts expected in Phase 3:** `src/types.ts`, `src/lib/services/positions.ts`,
  `src/components/positions/PositionsTable.astro`, `scripts/smoke.mjs`,
  `context/foundation/roadmap.md`. Keep both sides; S-02's Result column and link stay, this
  change's actions column is added last.

## Phase 1: Delete and restore flow

### Overview

Everything user-visible: service functions, endpoints, the inline confirmation, the notice with
Undo, the Deleted positions page and its link.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: A DTO for a row on the Deleted page.

**Contract**: `DeletedPositionItem = Pick<PositionRow, "id" | "instrument" | "buy_date" | "deleted_at">`
with `deleted_at: string` and `category_name: string`.

#### 2. Service

**File**: `src/lib/services/positions.ts`

**Intent**: Soft delete, restore and list deleted positions, always through the request-scoped
client.

**Contract**:
- `type SoftDeleteResult = { ok: true } | { ok: false; error: "not_found" | "unexpected" }`.
- `deletePosition(client, id)` sets `deleted_at` to the current timestamp where `id` matches and
  `deleted_at is null`, selecting `id`; zero rows → `not_found`.
- `restorePosition(client, id)` sets `deleted_at` to null where `id` matches and
  `deleted_at is not null`, selecting `id`; zero rows → `not_found`.
- Errors other than zero rows are logged with `logUnexpected` (code and message only) → `unexpected`.
- `listDeletedPositions(client): Promise<DeletedPositionItem[]>` — `deleted_at is not null`, with
  category name, ordered by `deleted_at` desc; throws on error like `listPositions`.

#### 3. Endpoints

**Files**: `src/pages/dashboard/positions/[id]/delete.ts`, `src/pages/dashboard/positions/[id]/restore.ts` (new)

**Intent**: Perform the action from a native form POST and redirect.

**Contract**: Export `POST` only (other methods get Astro's default 405-style response). Gated by
the `/dashboard` prefix; still return a redirect to `/auth/signin` when `locals.user` is null. A
non-uuid `id` or `not_found` → `404` response "Position not found". `unexpected` → redirect to
`/dashboard?error=delete_failed` / `?error=restore_failed`. Success: delete →
`/dashboard?deleted=<id>`; restore → `/dashboard`.

#### 4. Inline delete control

**File**: `src/components/positions/DeletePositionControl.astro` (new); `src/components/positions/PositionsTable.astro`

**Intent**: Satisfy the confirmation NFR without JS, inside a table row.

**Contract**: Props `id`, `instrument`. A `<details>` whose `<summary>` reads "Delete" and whose
body holds "Delete <instrument>? You can restore it later." plus a `<form method="POST"
action="/dashboard/positions/<id>/delete">` with a destructive "Delete" button, and a Cancel that
closes the `<details>`. `PositionsTable.astro` gets a last, unlabeled-heading ("Actions",
visually hidden) column rendering it.

#### 5. Dashboard notice and link

**File**: `src/pages/dashboard.astro`

**Intent**: Immediate undo, error feedback, and a permanent route to restore.

**Contract**: When `?deleted=` is a uuid, render a notice "Position deleted." with an Undo form
(POST to `/dashboard/positions/<id>/restore`) and a "Deleted positions" link. When
`?error=delete_failed` / `restore_failed`, render a fixed message ("The position could not be
deleted. Please try again." / "…restored…"); any other value is ignored. The header gains a text
link "Deleted positions" to `/dashboard/deleted`, shown in every state including the empty state.

#### 6. Deleted positions page

**File**: `src/pages/dashboard/deleted.astro` (new); `src/components/positions/DeletedPositionsTable.astro` (new)

**Intent**: Find and restore any deleted position (FR-009).

**Contract**: Uses `listDeletedPositions`; a failed read renders an error state, not a 500 (as on
`/dashboard`). Empty: "No deleted positions." with a link back to `/dashboard`. Otherwise a table:
Instrument, Category, Buy date, Deleted on (formatted like buy dates), and a Restore form per row
(POST to `/dashboard/positions/<id>/restore`). Separate component from `PositionsTable` so the two
tables evolve independently.

### Success Criteria:

#### Automated Verification:

- `verify` skill sequence passes (astro sync, lint, astro check, build)
- Existing smoke walk still passes: `BASE_URL=http://localhost:4321 npm run smoke`
- No migration added: `git diff --stat master -- supabase/` is empty

#### Manual Verification:

- Opening Delete in a row shows the confirmation; Cancel closes it; nothing is deleted until the confirm button
- With JavaScript disabled, the same confirm-then-delete flow works
- After deleting, the notice appears; Undo brings the row back in place
- Deleting every position leaves the empty state with a visible Deleted positions link; restore from there works
- `/dashboard/deleted` orders by most recently deleted and shows the deleted date
- Keyboard: the Delete summary, confirm and Cancel are reachable and operable with Tab and Enter/Space

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Smoke proof

### Overview

Prove the round trip and that a second account can neither see, delete nor restore the author's
positions.

### Changes Required:

#### 1. Smoke walk

**File**: `scripts/smoke.mjs`

**Intent**: Turn FR-009 and the privacy NFR into automated checks without disturbing the position
S-02's steps use.

**Contract**: A records a dedicated position `DEL-<runId>` (reusing `categoryName` as
`new_category_name`, which the service resolves to the existing category) and captures its id from
the delete form action in the dashboard HTML. New steps, after "A: dashboard lists the position":
- A: records the position to delete
- A: deletes it → 302 to `/dashboard?deleted=<id>`
- A: dashboard shows "Position deleted." and does not list `DEL-<runId>`
- A: deleted page lists `DEL-<runId>`
- A: deleting it again → 404
- A: restores it → 302 to `/dashboard`; dashboard lists it; deleted page does not
- A: deletes it again (left deleted for B's checks and for Phase 3)
- B (after sign-in): deleted page does not list `DEL-<runId>` or its id
- B: restore POST to A's id → 404; delete POST to A's main position id → 404
- anonymous: delete POST → redirect to `/auth/signin`

The id check (`excludesId`/`check`) generalises to cover position ids.

### Success Criteria:

#### Automated Verification:

- `BASE_URL=http://localhost:4321 npm run smoke` passes against local Supabase
- `verify` skill sequence passes

#### Manual Verification:

- After a deliberate break (temporarily remove the `deleted_at is null` filter from `listPositions`), the "dashboard does not list" step fails — then revert
- A pull request against `master` is opened so the `ci` job runs (the `smoke` job runs only after merge, so the local smoke run is the pre-merge proof)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: After rebasing onto S-02

### Overview

Start only after `position-detail-and-price` has merged to `master`. Rebase, then make the detail
page delete-aware and prove deleted positions stay hidden there.

### Changes Required:

#### 1. Rebase

**Intent**: Bring S-02's detail page, price columns and smoke steps into this branch.

**Contract**: `git rebase master`; resolve the conflicts listed under Critical Implementation
Details by keeping both sides; regenerate `src/db/database.types.ts` from the local database
instead of hand-merging it.

#### 2. Detail page delete

**File**: `src/pages/dashboard/positions/[id].astro`

**Intent**: Let the author delete from the page where they read a position.

**Contract**: Renders `DeletePositionControl` for the position. Confirms (and fixes if missing)
that `getPosition` and `updatePositionPrice` filter `deleted_at is null`.

#### 3. Smoke walk

**File**: `scripts/smoke.mjs`

**Intent**: Close the coordination check agreed with S-02.

**Contract**: While `DEL-<runId>` is deleted: A's GET of its detail page → 404; A's price POST to
it → 404. After a restore, its detail page → 200; then delete it again so B's checks still hold.

### Success Criteria:

#### Automated Verification:

- Rebased branch builds: `verify` skill sequence passes
- Regenerating `src/db/database.types.ts` produces no diff
- `BASE_URL=http://localhost:4321 npm run smoke` passes, including the deleted-detail and refused-price steps

#### Manual Verification:

- Deleting from the detail page lands on `/dashboard` with the Undo notice
- After Undo, the detail page opens again with its price and result intact

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None: the repo has no test framework, and adding one is out of scope.

### Integration Tests:

- `scripts/smoke.mjs`: delete/undo/restore round trip, wrong-state 404, two-account isolation,
  anonymous redirect (Phase 2); deleted position hidden on the detail page and from price updates (Phase 3).

### Manual Testing Steps:

1. Delete via the inline confirmation; Cancel once first and check nothing changed.
2. Undo from the notice.
3. Delete all positions; restore one from `/dashboard/deleted` via the header link.
4. Repeat step 1 with JavaScript disabled and with keyboard only.

## Performance Considerations

None: single-row updates and one extra list query on a separate page.

## Migration Notes

- No migration; this branch never changes the shared local database schema.
- Rollback is code-only. Positions deleted while this change was live stay hidden by the
  existing `listPositions` filter after a rollback; restoring them would need a manual
  `deleted_at = null` update.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-05)
- PRD: `context/foundation/prd.md` (FR-009, NFRs)
- Coordination: `context/changes/recoverable-delete/change.md`
- Parallel change: `position-detail-and-price` (`context/changes/position-detail-and-price/plan.md` on its branch)
- Schema: `supabase/migrations/20260929141102_create_diary_core.sql`
- Service pattern: `src/lib/services/positions.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Delete and restore flow

#### Automated

- [x] 1.1 verify skill sequence passes — 3ebb0fa
- [x] 1.2 Existing smoke walk still passes — 3ebb0fa
- [x] 1.3 No migration added — 3ebb0fa

#### Manual

- [x] 1.4 Inline confirmation opens, Cancel closes, nothing deleted before confirm — 3ebb0fa
- [x] 1.5 Confirm-then-delete works with JavaScript disabled — 3ebb0fa
- [x] 1.6 Undo notice restores the row — 3ebb0fa
- [x] 1.7 All-deleted empty state still links to Deleted positions and restore works — 3ebb0fa
- [x] 1.8 Deleted page ordered by deletion with deleted date — 3ebb0fa
- [x] 1.9 Delete control operable by keyboard — 3ebb0fa

### Phase 2: Smoke proof

#### Automated

- [x] 2.1 Smoke walk passes against local Supabase — 741edd7
- [x] 2.2 verify skill sequence passes — 741edd7

#### Manual

- [x] 2.3 A deliberate break makes the relevant smoke step fail — 741edd7
- [x] 2.4 Pull request opened so the ci job runs — 741edd7

### Phase 3: After rebasing onto S-02

#### Automated

- [ ] 3.1 Rebased branch passes verify
- [ ] 3.2 Regenerating database types produces no diff
- [ ] 3.3 Smoke walk passes including deleted-detail and refused-price steps

#### Manual

- [ ] 3.4 Deleting from the detail page lands on the Undo notice
- [ ] 3.5 After Undo the detail page shows price and result intact
