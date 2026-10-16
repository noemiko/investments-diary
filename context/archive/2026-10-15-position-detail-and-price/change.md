---
change_id: position-detail-and-price
title: Position detail view with manual price and dated result
status: archived
created: 2026-10-15
updated: 2026-10-16
archived_at: 2026-10-16T08:41:32Z
---

## Notes

Roadmap S-02 (FR-006, FR-011). Runs in parallel with `recoverable-delete` (S-05) in a separate worktree.

Coordination with S-05, agreed 2026-10-15:

- The Delete / Restore buttons belong to `recoverable-delete`, not to this change. Do not add delete UI to the detail page here.
- Every new read or write by id (`getPosition`, price update) must filter `deleted_at is null`: RLS checks only ownership, not deletion. A deleted position must 404 on its detail page and refuse a price update.
- Merge order: this change merges first; `recoverable-delete` rebases onto it.
- Shared local Supabase stack: no `supabase db reset` while both branches are active; regenerate `src/db/database.types.ts` after merge instead of hand-merging it.

Decided during implementation, 2026-10-15:

- The displayed result is the percentage only, e.g. `+20.00% as of Oct 15, 2026`. This overrides plan Phase 2 §3 (` · +100` amount) and the amount half of Progress row 2.4. `positionResult` still returns `amount` (null without quantity) for possible reuse in S-04; nothing renders it.
