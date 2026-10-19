---
change_id: named-wallets
title: Group investments into named wallets
status: archived
created: 2026-10-19
updated: 2026-10-19
archived_at: 2026-10-19T14:51:31Z
---

## Notes

Agreed plan and six decisions confirmed in the planning conversation. User explicitly authorized implementation of all three phases. plan.md owns execution Progress.

## Verification — 2026-10-19

- 22 unit tests passed; lint, Astro check (0 errors/warnings) and production build passed.
- Isolated temporary database fixtures passed for pre-wallet backfill, deleted-entry preservation, empty owners, authenticated ownership, required assignment, duplicate names and hard/soft deletion restrictions. Temporary database was removed by the test.
- Expanded HTTP smoke suite passed against the local app with run-specific test accounts. It covers wallet membership/totals, editing, duplicate names, validation retention, delete/restore recalculation, diary-wide confrontation and authentication/privacy.
- Migration history: 20261019112848 was applied locally but absent remotely. Preserved it; applied only the new 20261019150000 forward constraint locally. No production migration or deployment performed.
- Build used local Node 26; Vercel targets the declared Node 24 runtime and emitted a version warning.
- Manual acceptance remains pending in plan.md. No commits were created.

## Plan-review fix F1 — 2026-10-19

- Completed position reads for wallet summaries and member lists using sequential ranges of 500, deterministic ordering and the original request-scoped client. Any batch error rejects the full read.
- Added capped-transport service regression fixtures with 1,200/2,400 entries across two wallets, including a wallet over 1,000 entries, a lower server cap, empty results and a failed later page. Requests retain authorization and wallet/deleted filters; these fixtures do not replace database RLS tests.
- Verification: 27 tests pass; lint, Astro check (0 diagnostics), build and diff whitespace checks pass. Deliberately returning only the first batch made four regression cases fail; restored implementation and reran successfully.
- Local Supabase API was unavailable, so live HTTP smoke and database RLS tests were not rerun for this correction. The build retains the existing local Node 26 / deployment Node 24 warning.
- Plan now records the batching contract and completed automated rows 2.6/3.6. Manual acceptance remains pending. No commit or deployment performed.
