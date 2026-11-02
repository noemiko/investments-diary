# Consolidate the Database Contract Tests: Plan Brief

> Full plan: `context/changes/consolidate-db-contract-tests/plan.md`
> Research: `context/changes/consolidate-db-contract-tests/research.md`
> Re-planned 2026-11-02, during Phase 1: `testing/database` keeps only the riskiest cases.

## What & Why

This change shrinks the raw-SQL database tests to the cases that smoke can't catch by construction:

- **Grant gaps.** Smoke runs on the permissive local stack. It passed while production returned `42501` on 2026-11-02.
- **Direct database access.** Smoke uses only the app's pages and never calls PostgREST directly.

Everything else (constraints, prices, snapshots, concurrency) is left to `npm run smoke` and the Vitest suite.

## Starting Point

Phase 1 is built:

- a shared helper (`lib/db-harness.mjs`);
- a contract runner with a `grants` domain;
- an assertion map of every old assertion.

`test-wallet-database` and `test-policy-grants` are already deleted. Four other raw-SQL scripts remain: close, snapshots, market-prices and required-selection.

## Desired End State

`npm run test:contract-db` replays the migration chain once under production privileges and runs two domains:

- **grants:** every policy has a grant, and anon has no access.
- **access:** for every table in `public`, a signed-in user reads their own rows and can't read, change, delete or create another user's rows, and anon gets `42501`.

A new table without RLS, without an owner column or without a fixture fails the test. Only the contract, recovery, cron and Vitest-launcher scripts remain.

## Key Decisions Made

| Decision                        | Choice                                                                           | Why (1 sentence)                                                                         | Source  |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| Database test scope             | Keep only access + grants; leave the rest to smoke/Vitest                        | Smoke can't see grant gaps or direct-API access; it covers app behaviour.                | Re-plan |
| Separate scripts                | Keep `test-wallet-cron` and `test-market-price-recovery`                         | Cron registration and the operator recovery SQL are tested nowhere else.                 | Re-plan |
| Table coverage                  | Discover tables from the catalogue; a missing fixture fails                      | A future table can't silently escape the owner-only check.                               | Re-plan |
| Expected foreign UPDATE         | 0 rows where UPDATE is granted, exact `42501` otherwise, read from the catalogue | The test follows grant changes but still proves RLS filters rows.                        | Re-plan |
| Refusals (delete, insert, anon) | Exactly `42501`                                                                  | Pins production privileges, so an accidental grant fails the test.                       | Plan    |
| Early removals                  | `test-wallet-database`, `test-policy-grants` deleted in Phase 1                  | The first protected nothing on today's schema; the second is superseded by `grants.mjs`. | Re-plan |
| Phase 6 prerequisite            | Treated as accepted                                                              | `automatic-stock-prices` is archived, so the transition checks have no remaining target. | Plan    |
| Shared setup                    | One helper, one replay                                                           | Removes six copies of the database, `auth` and replay scaffolding.                       | Plan    |

## Scope

**In scope:**

- The `access` domain and four deliberate breaks.
- Re-pointing the assertion map.
- Deleting four scripts and moving the recovery script onto the helper.
- Updating `package.json`, `ci.yml`, the verify skill, `README.md`, `scripts/README.md`, `deploy-plan.md` and roadmap F-01.

**Out of scope:**

- Any database-level test of constraints, prices, concurrency, snapshots or the selection guard. These are left to smoke and Vitest, or are not covered.
- Owner write success, which smoke covers.
- Changes to migrations, application code, Vitest or smoke.

## Architecture / Approach

`contract/access.mjs`:

1. Lists the tables in `public` from `pg_class`.
2. Checks RLS and `user_id` on each one.
3. Seeds two owners' rows in foreign-key order as the privileged role.
4. As user A, checks reads, foreign updates (on a column A may update), deletes and inserts.
5. As anon, checks reads.

Each table's expected outcome comes from its privileges in the catalogue.

## Phases at a Glance

| Phase                                          | What it delivers                                                    | Key risk                                             |
| ---------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| 1. Shared helper, runner and assertion map     | Harness, `grants` domain, assertion map (done; awaiting map review) | —                                                    |
| 2. Owner-only access across every table        | `access` domain for 8 tables, 4 recorded breaks, re-pointed map     | A foreign UPDATE on a non-updatable column hides RLS |
| 3. Remove remaining scripts, update references | 4 scripts deleted, recovery on the helper, CI and docs updated      | A stale reference to a removed command               |

**Prerequisites:** local Supabase running (`npx supabase start`).
**Estimated effort:** about 2 sessions for Phases 2–3.

## Open Risks & Assumptions

- **Accepted coverage loss.** Snapshot immutability and arithmetic, quote-cache concurrency, the manual-versus-automatic price boundary, and the selection guard against privileged changes have no remaining test. Smoke doesn't reach them (cron path, no downloads, single requests).
- **Wallet constraints** (non-negative value, no delete) are checked at the database level only through access refusals. Smoke covers duplicate names and invalid edits through the form.

## Success Criteria (Summary)

- One command proves every table is reachable only by its owner and every policy is granted, under production privileges, and the CI run on every PR includes it.
- `scripts/testing/database/` holds only the contract, recovery, cron and Vitest-launcher scripts.
- No script, npm command or live document refers to a removed script.
