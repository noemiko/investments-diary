---
change_id: recoverable-delete
title: Delete and restore a position
status: impl_reviewed
created: 2026-10-15
updated: 2026-10-16
archived_at: null
---

## Notes

Roadmap S-05 (FR-009). Runs in parallel with `position-detail-and-price` (S-02) in a separate worktree.

Coordination with S-02, agreed 2026-10-15:
- This change owns the Delete / Restore buttons.
- The position detail page and price update come from S-02 and are not on this branch. After rebasing onto S-02, verify that a deleted position 404s on its detail page and refuses a price update.
- Merge order: `position-detail-and-price` merges first; this change rebases onto it.
- Shared local Supabase stack: no `supabase db reset` while both branches are active; regenerate `src/db/database.types.ts` after merge instead of hand-merging it.
