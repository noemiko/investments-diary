# Recoverable Delete — Plan Brief

> Full plan: `context/changes/recoverable-delete/plan.md`

## What & Why

The author can delete a position after confirming it, undo straight away, and restore it later
from a Deleted positions page. This is roadmap slice S-05 (FR-009). Deletion hides rather than
destroys, so the diary keeps even the embarrassing trades it exists to preserve, and nothing
disappears without the author's say-so.

## Starting Point

`positions.deleted_at` already exists, there is no delete policy, and the owner-only update policy
already allows setting it. `listPositions` already hides deleted rows. There is no way to delete,
no way to see deleted rows, and an all-deleted diary would show only the "first investment" empty state.

## Desired End State

Each list row has a Delete control that expands into an inline confirmation (no JavaScript
needed). After deleting, the dashboard says "Position deleted." with Undo. `/dashboard/deleted`
lists deleted positions with Restore, linked from the dashboard header in every state. After
S-02 merges, the detail page has the same control, and a deleted position's detail page and price
update both answer 404.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Confirmation | Inline `<details>` in the row | Works without JS like every form here and needs no by-id read that would clash with S-02. |
| Restore location | Separate `/dashboard/deleted` page | Keeps the main list clean and makes leaks into it easy to test for. |
| After delete | Notice with Undo on `/dashboard` | A wrong click is fixed in one step. |
| Detail page | Final phase after rebasing onto S-02 | Closes the agreed coordination check inside this change. |
| Schema | No migration | `deleted_at` and the update policy already exist; nothing touches the shared local database. |
| Endpoints | POST-only routes under `/dashboard/positions/[id]/` | Gated by the existing middleware prefix; redirects like the auth POSTs. |
| Not-found | 404 for foreign, unknown, malformed or wrong-state ids | Zero rows updated under RLS looks the same for all of them. |
| Retention | Restorable forever, no purge | FR-009 says recoverable, with no time limit. |
| Smoke data | Dedicated `DEL-<runId>` position | Never disturbs the position S-02's smoke steps reprice. |

## Scope

**In scope:**
- Service: delete, restore, list deleted
- Two POST endpoints; inline confirmation; Undo notice; Deleted page and header link
- Smoke steps for the round trip and two-account isolation
- After S-02 merges: rebase, Delete on the detail page, deleted-detail and refused-price checks

**Out of scope:**
- Hard delete or purge; restore confirmation; category delete (S-08)
- The confrontation's filter (S-03 must reuse `deleted_at is null`)
- New dependencies, dialogs or islands

## Architecture / Approach

Native form POSTs reach `src/pages/dashboard/positions/[id]/{delete,restore}.ts`, which call
`deletePosition` / `restorePosition` in `src/lib/services/positions.ts` with the request-scoped
client (RLS applies). Each update filters on the current `deleted_at` state and treats zero rows as
not found. `DeletePositionControl.astro` is shared by the list and, in Phase 3, the detail page;
`DeletedPositionsTable.astro` stays separate from `PositionsTable` to avoid coupling and merge friction.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Delete and restore flow | All user-visible delete/undo/restore behaviour | Styling a `<details>` confirmation inside a table cell |
| 2. Smoke proof | Round trip and isolation checks | Scraping the position id from the delete form action |
| 3. After rebasing onto S-02 | Detail-page Delete; deleted → 404 there and price refused | Merge conflicts in types, service, table and smoke script |

**Prerequisites:** Docker running for local Supabase. Phase 3: `position-detail-and-price` merged to `master`.
**Estimated effort:** ~2–3 sessions; Phases 1–2 in parallel with S-02, Phase 3 after it.

## Open Risks & Assumptions

- The change cannot close until S-02 merges (Phase 3 depends on it).
- `?deleted=<id>` is only a hint; the restore endpoint enforces ownership, so a forged id exposes nothing.
- A code rollback leaves already-deleted positions hidden; restoring them would need a manual update.
- S-03 must reuse the deleted filter, or deleted positions will reappear in the confrontation.

## Success Criteria (Summary)

- The author never loses a position without confirming, and can undo or restore any deletion.
- The list (and later the confrontation and detail page) never shows a deleted position.
- The smoke walk proves another account can neither see, delete nor restore the author's positions.
