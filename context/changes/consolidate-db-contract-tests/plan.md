# Consolidate the Database Contract Tests Implementation Plan

> **Re-planned 2026-11-02, during Phase 1 (owner decision).** `testing/database` keeps only the riskiest cases: owner-only access across every table and the grant invariant. It also keeps the cron registration test and the recovery-template test. All other database behaviour is left to `npm run smoke` and the Vitest suite (`tests/database/`). Phase 1 is unchanged; the original Phases 2–4 (porting every permanent rule) are replaced by Phases 2–3 below.

## Overview

Shrink `scripts/testing/database/` to the cases that smoke can't catch by construction:

- **Grant gaps.** Smoke runs on the local stack, whose permissive default privileges hid the 2026-11-02 production `42501`.
- **Direct database access.** Smoke goes only through the app's pages and never calls PostgREST directly.

One contract test replays the full migration chain once, under production privileges (no default privileges, no hand grants). It checks two things:

- every RLS policy is backed by a grant, and anon has no access;
- for **every** table in `public`, a signed-in user can read their own rows and can't read, change, delete or create another user's rows.

The list of tables is discovered from the catalogue, so a new table without RLS, without an owner column or without an access fixture fails the test. The four remaining raw-SQL scripts are deleted.

## Current State Analysis

Phase 1 is in place:

- the shared helper `scripts/testing/database/lib/db-harness.mjs`;
- the runner `test-contract-database.mjs` (with `--only <domain>`);
- the `grants` domain;
- `test:contract-db`;
- the assertion map in `verification.md`.

`test-wallet-database.mjs` and `test-policy-grants.mjs` were deleted early, at the owner's request (`verification.md`, "Early removals").

Still in `scripts/testing/database/`:

- `test-decimal-database.mjs`: the Vitest launcher; it stays.
- `test-wallet-cron.mjs`: stays.
- `test-market-price-recovery.mjs`: stays.
- `test-close-database.mjs`, `test-snapshots-database.mjs`, `test-market-prices-database.mjs`, `test-required-selection-migration.mjs`: to be removed.

The current schema has 8 tables in `public`: `positions`, `reason_categories`, `wallets`, `wallet_snapshots`, `market_quote_cache`, `market_listing_lookups`, `market_listing_targets` and `market_selection_receipts`. A full-chain probe on 2026-11-02 found:

- All 8 have RLS enabled and a `user_id` column.
- `authenticated` has `SELECT` on all 8.
- `INSERT` is granted only on `positions`, `wallets` and `reason_categories`.
- `UPDATE` (table-level or column-level) is granted only on those same three.
- No table grants `DELETE`.
- `anon` has no table privileges.

[smoke.mjs](../../../scripts/testing/smoke.mjs) covers, over HTTP:

- cross-account isolation of positions, wallets and categories;
- duplicate wallet names and invalid edits;
- delete and restore;
- closing a position, including a repeat close and a stale reprice;
- wallet arithmetic.

The Vitest suite covers sale constraints, wallet moves, a competing complete sale, retired RPCs, `wallet_id` returning `42501`, and exact decimal transport.

## Desired End State

- `npm run test:contract-db` runs the `grants` and `access` domains on a disposable full-chain database with no hand table grants. Both pass.
- The `access` domain fails if a table in `public` has no RLS, has no `user_id`, or has no access fixture, or if any owner-only expectation doesn't hold.
- Deliberate breaks of the access family (RLS disabled, a permissive policy, an anon grant, a DELETE grant) each make the test fail, and the results are recorded.
- `scripts/testing/database/` contains only:
  - `lib/db-harness.mjs`
  - `contract/grants.mjs`
  - `contract/access.mjs`
  - `test-contract-database.mjs`
  - `test-decimal-database.mjs`
  - `test-wallet-cron.mjs`
  - `test-market-price-recovery.mjs`
- `test-market-price-recovery.mjs` uses the shared helper and has no hand grant.
- npm scripts: `test:contract-db`, `test:recovery-db`, `test:decimal-db`, `test:wallet-cron`. No live reference names a removed script or command.

### Key Discoveries:

- `supabase/migrations/20261102150000_grant_core_table_access.sql:1–9`: production grants no DELETE and nothing to `anon`. A failing RLS `WITH CHECK` and a missing privilege both raise `42501`.
- `supabase/migrations/20261102120000_require_position_stock_selection.sql`: `positions.market_target_id` is `NOT NULL` and guarded. Position fixtures must be inserted, as the privileged role, together with a matching `market_listing_targets` row.
- `scripts/testing/database/lib/db-harness.mjs`: `fixtureId(domain, kind, index)`, `asUser`/`asAnon`/`asPrivileged`, `expectError(sqlstate, …)` and `assert(…)` already exist. Register an `access` prefix next to the existing ones.

## What We're NOT Doing

- Not keeping any database-level test of these, which are left to smoke and Vitest:
  - sale constraints and wallet constraints;
  - the selection guard and locked columns (beyond the generic foreign-write refusal);
  - quote-cache concurrency, leases and cooldown;
  - the price-precedence boundary;
  - snapshot arithmetic, idempotency and immutability;
  - download behaviour.
- Not keeping migration-transition checks; git history is the record.
- Not testing that signed-in users can change their own rows. Smoke covers that path through the app.
- Not changing migrations, application code, the Vitest suite or `smoke.mjs`.
- Not changing `test-decimal-database.mjs` or `test-wallet-cron.mjs`.
- Not adding aliases for removed npm scripts.
- Not editing historical records (archived changes).

## Implementation Approach

Phase 2 adds one generic domain and proves it with deliberate breaks. Phase 3 deletes the scripts that are no longer wanted and updates every reference.

Expected outcomes come from the privilege catalogue, not from a hand-maintained table:

- a foreign UPDATE on a table with an UPDATE privilege must affect 0 rows;
- on a table without one, it must raise `42501`.

When a grant changes, the test therefore follows production. RLS stays the thing it checks.

## Critical Implementation Details

- **Foreign-UPDATE target.** A foreign UPDATE must name a column the role is allowed to update; for `positions`, use a column-granted one such as `current_price`. Otherwise every attempt raises `42501` from the column privilege, and the RLS row filter is never exercised.
- **Fixture order.** Fixtures are inserted as the privileged role in foreign-key order: categories and wallets, then targets and receipts, then positions, cache, lookups and snapshots. Each owner gets at least one row in every table.

## Phase 1: Shared helper, runner and assertion map

### Overview

Build the scaffolding, write the full old→new assertion map, and port the policy-grant domain as the pilot. This proves the harness reproduces production privileges.

### Changes Required:

#### 1. Shared helper

**File**: `scripts/testing/database/lib/db-harness.mjs`

**Intent**: Hold the scaffolding that six scripts currently each copy, so domain files contain only fixtures and assertions.

**Contract**: Exports:

- create/drop of a randomly named disposable database;
- fake `auth` schema install (`auth.users`, `auth.uid()` from `request.jwt.claim.sub`, schema `usage` grants only);
- sorted migration discovery that excludes `20261028170000_register_daily_wallet_snapshot_job.sql`, plus an optional `until` cut used by the recovery script;
- `sql(input)` with `ON_ERROR_STOP`;
- a role helper (`asUser(id)`, `asAnon()`, `asPrivileged()`);
- an `expectError(sqlstate, statement)` assertion and a boolean `assert(condition, message)`;
- a helper that runs two concurrent `psql` sessions;
- the UUID-prefix registry.

It must never issue a table, sequence or function grant.

#### 2. Contract runner

**File**: `scripts/testing/database/test-contract-database.mjs`

**Intent**: The single entry point. Create the database, replay the chain once, run the domain files in a fixed order, report which domain and assertion failed, and drop the database in `finally`.

**Contract**: The domain list is fixed, starting with `grants`. A non-zero exit on the first failure names the domain. An optional `--only <domain>` flag makes deliberate-break runs faster.

#### 3. Policy-grant domain (pilot)

**File**: `scripts/testing/database/contract/grants.mjs`

**Intent**: Port `test-policy-grants.mjs:36–63`: every authenticated policy is backed by a grant (with the two-entry allowlist), views are readable, and anon has no data access.

**Contract**: Same queries and allowlist as the source, run through the helper.

#### 4. npm script

**File**: `package.json`

**Intent**: Add `test:contract-db` next to the existing scripts. Nothing is removed yet.

**Contract**: `"test:contract-db": "node scripts/testing/database/test-contract-database.mjs"`.

#### 5. Assertion map

**File**: `context/changes/consolidate-db-contract-tests/verification.md`

**Intent**: Before porting further, list every assertion from the six in-scope scripts, with its file:line, class (P/T/F) and destination. The destination is a contract domain file, existing Vitest coverage (with file:line), or "dropped" with a reason (transition, setup sanity, or obsolete `currency_required`).

**Contract**: A table with the columns `Source file:line | Rule | Class | Destination | Note`, seeded from research §2 and §4. Every **P** row has a non-dropped destination. A "Deliberate breaks" section stays empty until Phase 3.

### Success Criteria:

#### Automated Verification:

- `npm run test:contract-db` passes with only the `grants` domain enabled
- `grep -nE "grant (all|select|insert|update|delete)" scripts/testing/database/lib scripts/testing/database/contract scripts/testing/database/test-contract-database.mjs` returns no table grants
- Old suites still pass: `npm run test:grants-db`
- `npm run lint` passes

#### Manual Verification:

- The assertion map covers every assertion line of the six in-scope scripts, and every **P** row has a destination

**Implementation Note**: After automated verification passes, pause for the human to review the assertion map before porting the remaining domains.

---

## Phase 2: Owner-only access across every table

### Overview

Add the `access` domain. It discovers every table in `public` and proves owner-only access under production privileges. Then prove it with deliberate breaks and update the assertion map to the re-planned destinations.

### Changes Required:

#### 1. Access domain

**File**: `scripts/testing/database/contract/access.mjs`

**Intent**: For every ordinary table in `public` (from `pg_class`, `relkind = 'r'`), check:

- **Catalogue:** RLS is enabled and a `user_id` column exists.
- **Fixture:** a per-table fixture builder exists; a discovered table with no builder fails with "add an access fixture for <table>".
- **Seeding:** each table gets at least one row for user A and one for user B, inserted as the privileged role.
- **Signed in as A:**
  - A sees at least one of their own rows, and zero rows with `user_id` = B;
  - updating B's rows affects 0 rows on tables with an UPDATE privilege, and raises exactly `42501` on the others;
  - deleting B's rows raises exactly `42501`;
  - inserting a row with B's `user_id` raises exactly `42501`, whether from RLS `WITH CHECK` or from the missing privilege;
  - after all of these, B's rows are unchanged, checked as the privileged role.
- **As anon:** `select` on every table raises exactly `42501`.

**Contract**:

- Default export `access(db)` returns a summary that names the number of tables checked.
- The expected UPDATE outcome per table is read from the catalogue (`has_any_column_privilege('authenticated', …, 'update')`).
- The fixtures use the `access` UUID prefix.

#### 2. Prefix registry and runner

**File**: `scripts/testing/database/lib/db-harness.mjs`, `scripts/testing/database/test-contract-database.mjs`

**Intent**: Register the `access` fixture prefix, and append `access` to the runner's fixed domain list after `grants`.

**Contract**: The domain order is `grants`, `access`. `--only access` works.

#### 3. Assertion map and deliberate breaks

**File**: `context/changes/consolidate-db-contract-tests/verification.md`

**Intent**: Re-point the map to the new scope:

- RLS and isolation, foreign-write and anon rows → `contract/access.mjs` (file:line);
- the policy-grant rows stay at `contract/grants.mjs`;
- every other **P** row → "left to smoke/Vitest", citing the smoke step or Vitest file:line where one exists, otherwise "not covered (accepted, re-plan 2026-11-02)".

Then record the deliberate breaks.

**Contract**: The "Deliberate breaks" section lists four breaks. Each is a worktree-only edit appended to the last migration, run with `--only access` (or `--only grants`) and then reverted:

1. `alter table public.wallet_snapshots disable row level security`
2. a `using (true)` select policy on `public.reason_categories`
3. `grant select on public.positions to anon`
4. `grant delete on public.wallets to authenticated`

For each, record the break, the failing message and "reverted".

### Success Criteria:

#### Automated Verification:

- `npm run test:contract-db` passes with `grants` and `access`, and the access summary reports 8 tables
- `npm run test:contract-db` passes twice in a row (fixtures don't collide)
- The grant grep over `lib/`, `contract/` and the runner still returns no table grants
- `git diff --stat supabase/migrations` is empty after the break runs
- `npm run lint` passes

#### Manual Verification:

- `verification.md` records the four access breaks, each with a failing message from the expected domain
- Every **P** row in the assertion map has a re-planned destination (access, grants, smoke/Vitest reference, or "not covered (accepted)")

**Implementation Note**: Pause for human review of the map and the break evidence before Phase 3 deletes scripts.

---

## Phase 3: Remove the remaining scripts and update references

### Overview

Delete the four raw-SQL scripts that fall outside the riskiest-cases scope, move recovery onto the helper, and update every live reference.

### Changes Required:

#### 1. Delete scripts

**File**: `scripts/testing/database/test-close-database.mjs`, `test-snapshots-database.mjs`, `test-market-prices-database.mjs`, `test-required-selection-migration.mjs`

**Intent**: Remove them; their access checks now live in `contract/access.mjs`, and the rest is left to smoke and Vitest.

**Contract**: Four files deleted.

#### 2. Recovery script on the helper

**File**: `scripts/testing/database/test-market-price-recovery.mjs`

**Intent**: Replace its copied scaffolding with the helper (using the `until` cut for its pre-price-migration fixture) and remove the redundant hand grant at `:72`. Its checks of the recovery template are unchanged.

**Contract**: It still reads `context/deployment/automatic-stock-prices-manual-selection.sql`, and it contains no table grant.

#### 3. npm scripts and CI

**File**: `package.json`, `.github/workflows/ci.yml`

**Intent**:

- `package.json`: remove `test:close-db`, `test:snapshots-db` and `test:market-prices-db`; add `test:recovery-db`.
- `ci.yml`, in `decimal-transport`: replace the market-prices, close and snapshots steps with "Verify manual price recovery template" (`test:recovery-db`). Rename the contract step to "Verify every table is reachable only by its owner, and every policy is granted".

**Contract**: `"test:recovery-db": "node scripts/testing/database/test-market-price-recovery.mjs"`. The decimal and cron steps are unchanged.

#### 4. Live references

**File**: `.claude/skills/verify/SKILL.md`, `README.md`, `scripts/README.md`, `context/deployment/deploy-plan.md`, `context/foundation/roadmap.md`, `context/changes/consolidate-db-contract-tests/plan-brief.md`

**Intent**:

- Point every live reference to a removed script or command at `test:contract-db` or `test:recovery-db`:
  - the verify skill;
  - the `README.md` runbook line;
  - the `scripts/README.md` table and prose (add the recovery row);
  - `deploy-plan.md`: the recovery rehearsal and the verification matrix.
- Update roadmap F-01's outcome text to the re-planned scope (access and grants in the database; the rest left to smoke and Vitest).

**Contract**: Historical records (archived changes) are not edited.

### Success Criteria:

#### Automated Verification:

- `npm run test:contract-db` passes
- `npm run test:recovery-db` passes
- `npm run test:decimal-db` and `npm run test:wallet-cron` still pass
- `ls scripts/testing/database` lists only `contract`, `lib`, `test-contract-database.mjs`, `test-decimal-database.mjs`, `test-market-price-recovery.mjs` and `test-wallet-cron.mjs`
- A grep for `test:(close|snapshots|market-prices|wallet|grants)-db`, `test-(close|snapshots|market-prices|wallet)-database`, `test-required-selection-migration` and `test-policy-grants`, excluding `node_modules`, `.git` and `context/archive`, returns only this change's own files
- `grep -nE "grant (all|select|insert|update|delete)" scripts/testing/database/test-market-price-recovery.mjs` returns nothing
- `npm run lint` passes

#### Manual Verification:

- The PR's CI run shows `decimal-transport` green with the renamed contract step and the recovery step, and no close/snapshots/market-prices steps (open a PR against `master`; a branch push alone runs no workflow)

---

## Testing Strategy

### Unit Tests:

- None. This change is test infrastructure only.

### Integration Tests:

- `test:contract-db`: grants and owner-only access for every table, under production privileges.
- `test:recovery-db`: the operator recovery template.
- `test:wallet-cron`: cron registration.
- Smoke and the Vitest suite remain the broad net for application behaviour.

### Manual Testing Steps:

1. Review the re-pointed assertion map and the four break records after Phase 2.
2. Check that the PR's CI run shows the expected steps.

## Performance Considerations

One full-chain replay for the contract test replaces several replays, so the `decimal-transport` job gets shorter: the close, snapshots and market-prices steps go away.

## Migration Notes

No schema or data migration. Rollback means reverting the commits, which restores the deleted scripts.

## References

- Related research: `context/changes/consolidate-db-contract-tests/research.md`
- Roadmap item: `context/foundation/roadmap.md` (F-01)
- Production grants: `supabase/migrations/20261102150000_grant_core_table_access.sql:1–9`
- Smoke coverage: `scripts/testing/smoke.mjs`
- Team rule: `context/foundation/lessons.md` ("Give registered users access to only their own rows in new tables")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared helper, runner and assertion map

#### Automated

- [x] 1.1 `npm run test:contract-db` passes with only the `grants` domain enabled — 074f546
- [x] 1.2 `grep -nE "grant (all|select|insert|update|delete)" scripts/testing/database/lib scripts/testing/database/contract scripts/testing/database/test-contract-database.mjs` returns no table grants — 074f546
- [x] 1.3 Old suites still pass: `npm run test:grants-db` — 074f546
- [x] 1.4 `npm run lint` passes — 074f546

#### Manual

- [x] 1.5 The assertion map covers every assertion line of the six in-scope scripts, and every **P** row has a destination — 074f546

### Phase 2: Owner-only access across every table

#### Automated

- [x] 2.1 `npm run test:contract-db` passes with `grants` and `access`, and the access summary reports 8 tables — 8244548
- [x] 2.2 `npm run test:contract-db` passes twice in a row (fixtures don't collide) — 8244548
- [x] 2.3 The grant grep over `lib/`, `contract/` and the runner still returns no table grants — 8244548
- [x] 2.4 `git diff --stat supabase/migrations` is empty after the break runs — 8244548
- [x] 2.5 `npm run lint` passes — 8244548

#### Manual

- [x] 2.6 `verification.md` records the four access breaks, each with a failing message from the expected domain — 8244548
- [x] 2.7 Every **P** row in the assertion map has a re-planned destination (access, grants, smoke/Vitest reference, or "not covered (accepted)") — 8244548

### Phase 3: Remove the remaining scripts and update references

#### Automated

- [x] 3.1 `npm run test:contract-db` passes
- [x] 3.2 `npm run test:recovery-db` passes
- [x] 3.3 `npm run test:decimal-db` and `npm run test:wallet-cron` still pass
- [x] 3.4 `ls scripts/testing/database` lists only the kept files and folders
- [x] 3.5 Grep for removed script and command names returns only this change's own files
- [x] 3.6 `grep -nE "grant (all|select|insert|update|delete)" scripts/testing/database/test-market-price-recovery.mjs` returns nothing
- [x] 3.7 `npm run lint` passes

#### Manual

- [x] 3.8 The PR's CI run shows `decimal-transport` green with the renamed contract step and the recovery step, and no close/snapshots/market-prices steps
