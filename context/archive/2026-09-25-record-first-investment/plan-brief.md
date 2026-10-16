# Record the First Investment — Plan Brief

> Full plan: `context/changes/record-first-investment/plan.md`

## What & Why

The author can record an investment together with the reason they bought it, and see it in a
private list of positions. This is roadmap slice S-01 and the first time the diary stores
anything; every later slice — price and result, the confrontation before a new buy, closing,
deleting, the reason lock, category editing — builds on the data model introduced here.

## Starting Point

Sign-up, sign-in, sign-out and `/dashboard` gating already work. There are no diary tables,
no generated database types, `/dashboard` is a placeholder, and nothing proves that one
account cannot read another's data — which matters because registration is open.

## Desired End State

From `/dashboard/new` the author enters instrument, per-share buy price and buy date (today by
default), picks or types a reason category, optionally writes the reason, and saves in under
a minute. `/dashboard` lists every position newest first with its category, or an empty state
on a new account. CI proves on every PR that a second account sees none of it and cannot
attach a position to someone else's category.

## Key Decisions Made

| Decision           | Choice                                              | Why (1 sentence)                                                                                |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Buy price          | Per share                                           | Comparable with the per-share current price S-02 adds, so a result works even without quantity. |
| Same stock twice   | Two separate positions                              | Each reason keeps its own outcome, which the confrontation groups by.                           |
| Category creation  | Pick or create inside the form                      | No detour before the first entry; protects the 60-second target.                                |
| Buy date           | Today or earlier, default today                     | Allows back-filling existing holdings and catches mistyped years.                               |
| Privacy proof      | Extend the smoke walk with a second account         | Zero new dependencies; CI's smoke job already runs a local database.                            |
| Form handling      | Form page handles its own POST, re-renders on error | Keeps the reason text out of URLs and request logs.                                             |
| Category ownership | Composite FK `(category_id, user_id)`               | Row security alone would accept another user's category id.                                     |
| Hard delete        | No delete policies                                  | Deletes become soft deletes in S-05/S-08; nothing is destroyed.                                 |
| Numbers            | `,` or `.` decimal, > 0                             | The author may type Polish-style decimals.                                                      |

## Scope

**In scope:**

- Two tables with owner-only row security, a tested down-script, generated types, typed client
- Validation, service layer, entry form with inline category picker, positions list with empty state
- Smoke-walk isolation checks in CI

**Out of scope:**

- Detail view, prices and results; confrontation; closing, deleting, editing, reason lock
- Renaming or removing categories; gating pages outside `/dashboard`
- A unit/integration test framework; currencies; merged holdings

## Architecture / Approach

Astro pages under `/dashboard` (gated by the existing middleware prefix) call a small service
in `src/lib/services/`, which always uses the request-scoped Supabase client so row security
applies. A zod schema from `astro/zod` parses the native form POST. The form is a React island
following the sign-in form's pattern. Types flow from the generated `database.types.ts`
through `src/types.ts` to the components.

## Phases at a Glance

| Phase              | What it delivers                                               | Key risk                                                                     |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Data model      | Tables, RLS, down-script, generated types, typed client        | A missing or wrong policy fails silently — checked by querying `pg_policies` |
| 2. Record and list | Entry form with inline categories, positions list, empty state | Entry form creeping past the 60-second target                                |
| 3. Privacy proof   | Two-account isolation steps in the CI smoke walk               | Brittle HTML scraping of the category id in the smoke script                 |

**Prerequisites:** Docker running for the local Supabase stack; the human pushes the Phase 1 migration to production (`npx supabase db push`) before Phase 2 merges.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Preview deployments share the production Supabase project (deploy-plan open decision 1), so a Phase 2 preview writes real rows.
- The down-script is only safe before real entries exist; afterwards rollback is code-only.
- An orphan category can remain if a position insert fails after its inline category was created — accepted as harmless.

## Success Criteria (Summary)

- The author records their first investment with a new category in under 60 seconds and sees it listed.
- A fresh account sees a helpful empty state, not a blank page.
- The CI smoke job proves a second account sees nothing of the first and cannot borrow its category.
