# Review follow-ups: recoverable-delete

From `reviews/impl-review.md` (2026-10-16). Not done in this change; pick up in a later one.

## F9a — Bound the Deleted positions list

- **Where**: `src/lib/services/positions.ts` `listDeletedPositions`; `src/pages/dashboard/deleted.astro`
- **What**: The query has no limit (neither has `listPositions`). Add `.limit(N)` and, when the limit
  is hit, a note such as "Showing the N most recently deleted." Code-only.
- **When**: Once the deleted list can realistically grow past a page, or alongside paging for the main list.

## F9b — Stamp `deleted_at` with the database clock

- **Where**: `deletePosition` in `src/lib/services/positions.ts` (currently `new Date().toISOString()`)
- **What**: Set `deleted_at` with the database's `now()` (trigger on the update, or an RPC), so the
  Deleted page's order doesn't depend on the clocks of the serverless instances.
- **Constraint**: Needs a migration. Apply the RLS tripwire and the "`if not exists` on all or none"
  lesson; don't run it while another branch shares the local Supabase stack.
