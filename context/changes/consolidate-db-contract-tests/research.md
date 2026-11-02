---
date: 2026-11-02T12:42:08+01:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 6966806
branch: chore/remove-preview-script
repository: investments-diary
topic: "Which database test assertions are permanent rules, which are migration transitions, and what a consolidated contract test must keep"
tags: [research, testing, database, supabase, rls, grants, migrations, ci]
status: complete
last_updated: 2026-11-02
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: Consolidating the database contract tests

**Date**: 2026-11-02T12:42:08+01:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 6966806 (`master` merge of PR #27). The working tree has uncommitted, unrelated edits (preview-script removal, CI steps for `test:close-db`/`test:snapshots-db`, roadmap F-01), so line numbers below are from that working tree.
**Branch**: chore/remove-preview-script
**Repository**: investments-diary

## Research Question

For roadmap item F-01 ([roadmap.md](../../foundation/roadmap.md), "Consolidate the database contract tests"): across `scripts/testing/database/`, which assertions protect permanent rules of the final schema, which only verify one-time migration transitions or intermediate schema states, which permanent rules are already covered by the `tests/database/` Vitest suite, what setup is duplicated or misleading, and what depends on these scripts.

## Summary

- **Nine files, two different kinds of test.**
  - [test-decimal-database.mjs](../../../scripts/testing/database/test-decimal-database.mjs) (22 lines) is not a SQL test. It launches the Vitest database suite (`tests/database/*.test.ts`) against the running local stack, so it must stay.
  - The other eight are raw-SQL scripts. Seven of them `createdb` a disposable database, fake `auth.uid()`, and replay migrations. The exception is `test-wallet-cron.mjs`, which runs inside a rolled-back transaction in the local `postgres` database.
- **Hand grants make five scripts more permissive than production.** Production gives `anon`/`authenticated` no data privileges on objects created by migrations; that missing default caused the 2026-11-02 `42501`. These five scripts grant those privileges by hand. The fifth, `test-required-selection-migration.mjs:54–55`, grants more narrowly and is covered in §3. The four broadest:
  - `test-close-database.mjs:47` grants `all on all tables in schema public to authenticated, anon` **after the full chain**, overriding every table- and column-privilege revoke the chain makes (function `execute` revokes are unaffected).
  - `test-wallet-database.mjs:37` grants the same after four migrations.
  - `test-market-prices-database.mjs:70` grants `all` on `positions`/`wallets`/`reason_categories` to `authenticated, anon` mid-chain.
  - `test-market-price-recovery.mjs:72` grants `select` on the same three tables.

  As a result, at least four checks pass only because of these grants: "hard deletion permitted" and "anonymous read permitted" in both the close and wallet tests. On the final schema these would raise `42501` instead. This is inferred from the grants, not executed.

- **Permanent rules that are not tested on the final schema.**
  - `test-wallet-database.mjs` applies only the first four migrations (lines 22–36). None of its permanent wallet rules are checked against today's schema, and it runs only in the push-only `smoke` CI job (`ci.yml:89`).
  - `test-market-prices-database.mjs` checks most permanent market-price rules at an intermediate schema (lines 83–229, before `20261030140619`). Two of its steps would fail on the final schema:
    - a signed-in update of `market_listing_id` (line 105), which is revoked by `20261102140000`;
    - an insert without a selection (line 223), which is rejected because of `NOT NULL` from `20261102120000`.
- **Transition checks.** These verify transformations of pre-existing rows or intermediate states. No fresh test database and no already-migrated production can exercise them again:
  - the wallet "Main" backfill (wallet `:39–44`);
  - the close migration keeping existing rows and policies (close `:49–56`);
  - currency attestation, legacy moves, the USD backfill, inherited denominations and removal of obsolete metadata (market-prices `:72–76`, `:86–97`, `:204–211`, `:217`, `:220`, `:232–249`);
  - the Apple backfill and the facts left unchanged by it (required-selection `:96–101`, `:103`, `:107–113`).
- **Permanent rules with no coverage outside the raw-SQL scripts.** A consolidated test must keep each of these:
  - anonymous access;
  - `reason_categories` isolation;
  - foreign cache insert;
  - the revoked selection and listing columns;
  - `market_target_id NOT NULL`;
  - the re-enabled guard trigger;
  - the sale/override/missing selection order, including the equal-versus-strictly-later boundary;
  - re-stamping on an identical resave, and rejection of a spoofed timestamp;
  - quote-cache concurrency, cooldown, late-worker and older-quote rules;
  - wallet constraints;
  - hard-delete refusal;
  - snapshot arithmetic, idempotency, immutability and exactness;
  - the cron schedule;
  - the policy-grant invariant.

  The Vitest suite already covers sale constraints, wallet moves, the retired lookup RPCs, cooldown state and most RLS read isolation. Details are in Detailed Findings §4.

## Detailed Findings

### 1. Inventory and how each file runs

| File                                    | Lines | npm script                    | CI                                              | Chain replay                                                                            |
| --------------------------------------- | ----- | ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `test-decimal-database.mjs`             | 22    | `test:decimal-db`             | `decimal-transport` (`ci.yml:56`)               | none: runs Vitest (`vitest.database.config.ts`) on the live local database              |
| `test-wallet-cron.mjs`                  | 27    | `test:wallet-cron`            | `decimal-transport` (`ci.yml:58`)               | none: cron migration twice in `begin … rollback` on `postgres` (lines 9–19)             |
| `test-market-prices-database.mjs`       | 272   | `test:market-prices-db` (1st) | `decimal-transport` (`ci.yml:60`)               | three stages: split at `20261030110418` and `20261030140619` (lines 30–36, 60, 71, 237) |
| `test-market-price-recovery.mjs`        | 144   | `test:market-prices-db` (2nd) | same step                                       | split at `20261030110418` (lines 23–24, 59, 71) plus the operator template              |
| `test-required-selection-migration.mjs` | 177   | `test:market-prices-db` (3rd) | same step                                       | split at `20261102120000` (lines 20–26, 53, 94)                                         |
| `test-policy-grants.mjs`                | 70    | `test:grants-db`              | `decimal-transport` (`ci.yml:62`)               | full chain, no fixture                                                                  |
| `test-close-database.mjs`               | 121   | `test:close-db`               | `decimal-transport` (`ci.yml:64`, uncommitted)  | full chain, fixture before `20261028120000`                                             |
| `test-snapshots-database.mjs`           | 115   | `test:snapshots-db`           | `decimal-transport` (`ci.yml:66`, uncommitted)  | full chain, then fixture                                                                |
| `test-wallet-database.mjs`              | 104   | `test:wallet-db`              | `smoke` only, push to `master` (`ci.yml:73,89`) | **first four migrations only** (lines 22, 23, 35, 36)                                   |

### 2. Assertion classification

Classes: **P** = a permanent rule of the final schema; **T** = a one-time transition, or an intermediate state that later migrations removed; **F** = a sanity check on the test's own setup.

**`test-market-prices-database.mjs`.** I read this file in full myself, because the worker assigned to it failed on a network error.

- **F:** `:35–36` (split files exist), `:235–236` (the revision fixture has unspecified rows).
- **T:**
  - `:72–76`: legacy currency and save time not guessed; legacy wallet, position and snapshot facts unchanged.
  - `:84–97`: wallet currency attestation and confirmation flow, removed by `20261030140619`.
  - `:204–211`: the three-argument move API with attestation.
  - `:217`: legacy history not relabelled.
  - `:220`: old snapshot facts not rewritten during the intermediate stage.
  - `:232–249`: the USD backfill, inherited snapshot denominations, preserved facts, obsolete columns and API removed.
- **P, checked only at the intermediate stage:**
  - `:77–78`: cache RLS and its 3 policies.
  - `:98–104`: direct cache patch refused, foreign cache insert refused, cache isolation, foreign lease refused.
  - `:109–135`: one winner among concurrent claims, cooldown keeps the quote and the automatic selection, claim refused during cooldown, expired lease recovered, late worker refused, older quote refused.
  - `:137–168`: manual override; spoofed `manual_price_saved_at` refused; an equal market time keeps the override and a strictly later one replaces it; identical resave re-stamps; sale wins; manual fallback; missing.
  - `:170–176`: incompatible-currency link refused.
  - `:177–184`: effective-view isolation, foreign finish refused, anon has no cache privilege.
  - `:186–189`: direct `wallet_id` update refused.
  - `:218–219` and `:227–228`: capture uses the effective price and source counts; later corrections don't rewrite saved points.

  Steps `:105` and `:165`, signed-in updates of `market_listing_id`, and the insert without a selection at `:223`, would now be refused on the final schema (`20261102140000`, `20261102120000`).

- **P, checked on the final schema:**
  - `:251–256`: default USD wallet, matching-currency move succeeds, incompatible move refused, wallet currency frozen.
  - `:259–264`: the installed capture definition makes no HTTP calls.
  - `:265–266`: RLS and policies on `market_listing_lookups`.

**`test-required-selection-migration.mjs`.** I read this file locally.

- **F:** `:26` and `:154–155` (split files exist), `:83`.
- **T:** `:96–101` (tables, position facts and existing targets unchanged by the migration), `:103`, `:107–113` (the Apple backfill per account, a matching target for a confirmed listing, target metadata, no cross-account selection).
- **P, final schema:**
  - `:104–106`: `market_target_id` is `NOT NULL`, the guard is re-enabled, no positions trigger is left disabled.
  - `:118–134`: two layers protect a selection. A signed-in user gets `insufficient_privilege`; a privileged role gets the guard's `check_violation`; an insert without a selection gets `not_null_violation`.
  - `:136–146`: a download prices USD-wallet holdings, PLN/EUR holdings are reported as incompatible, and labels are not rewritten.
  - `:150–172`: the lookup RPCs are retired; target RPCs stay executable; `market_listing_id` and `listing_confirmed_at` are not updatable while `current_price` is.

**`test-market-price-recovery.mjs`.** All checks are **P** and test the recovery template ([automatic-stock-prices-manual-selection.sql](../../deployment/automatic-stock-prices-manual-selection.sql)) on the final schema (`:84–138`). Seeding data before the price migrations (`:59–70`) is only a fixture technique.

**`test-wallet-database.mjs`** (worker 2; anchors spot-checked):

- **T:** `:39–44` (the "Main" wallet backfill).
- **P, but on the four-migration schema only:** `:50`, `:52–53`, `:54–57`, `:58–60`, `:61–64`, `:65–68`, `:69–73`, `:80–82`, `:84–87`, `:92`. These cover RLS, owner edit, soft- and hard-delete refusal, unique name, non-negative value, required assignment, foreign update, foreign assignment and anon read.
- Later migrations change behaviour for some of these:
  - `20261030140619:7–9` adds a currency default and freezing;
  - `20261030122155:59–61` removes `wallet_id` from the signed-in UPDATE columns;
  - `20261102120000:50` makes `market_target_id` `NOT NULL`, so the insert at `:84–87` would raise `not_null_violation` before the foreign-key check;
  - `20261102150000:7` replaces the hand grant.

**`test-close-database.mjs`** (worker 2):

- **F:** `:20`.
- **T:** `:49–56` (rows kept, facts unchanged, still open, policies identical across the chain).
- **P:** `:57–58`, `:63–70`, `:71–101` (RLS, owner reads including soft-deleted rows, foreign close and reprice refused, the three sale constraints by name, zero same-day sale).
- **P, but masked by the `:47` grant:** `:102–104` and `:109`.

**`test-snapshots-database.mjs`** (worker 2): every check is **P** on the final schema (`:73–108`):

- concurrent idempotency;
- the arithmetic oracle;
- empty wallets captured;
- capture not executable by `anon`/`authenticated`;
- RLS;
- insert, update and delete refused;
- anon read;
- immutable history across delete, restore, close and a baseline edit;
- same-day retry;
- totals beyond `numeric(20,8)`.

It adds no hand table grants (only `grant usage`, `:27`).

**`test-wallet-cron.mjs`:** **P** at `:13–17` (one job, idempotent registration, capture restricted). The schedule, command, timezone and active state are checked inside the migration itself (`20261028170000:8–10, 22–29`), not by the script.

**`test-policy-grants.mjs`:** **P** at `:52`, `:57`, `:63` (every authenticated policy is backed by a grant; views are readable; anon has no data access). `:39` is an allowlist of two intentionally ungranted UPDATE policies.

### 3. Hand grants to `authenticated` / `anon` (complete list, worker 2; decisive anchors re-checked)

- `test-wallet-database.mjs:37`: `grant all on all tables in schema public to authenticated, anon;` (after four migrations).
- `test-close-database.mjs:47`: the same statement, after the full chain. It overrides `20261030122155:59` (revoke of table UPDATE on positions), `20261102140000` and `20261028160000:28` (snapshot write revokes).
- `test-market-prices-database.mjs:70`: `grant all on public.positions, public.wallets, public.reason_categories to authenticated, anon;` (mid-chain). `anon` keeps `all` on these tables for the rest of the run.
- `test-required-selection-migration.mjs:54–55`: `select, insert` on positions and `select` on wallets/reason_categories, granted before `20261102150000` runs later in the same file.
- `test-market-price-recovery.mjs:72`: `select` on the three tables after the full chain. This is now redundant with `20261102150000:7–9`.
- `auth.uid()` execute grants: `test-wallet-database.mjs:21`, `test-close-database.mjs:45`. Schema `usage` grants appear in all seven chain-replaying files. Both are needed for the fake `auth` schema.
- No file hand-grants execute on application functions.

### 4. Coverage of permanent rules outside the raw-SQL scripts (worker 3; two anchors re-checked)

How the Vitest suite differs from the raw-SQL scripts:

- It uses supabase-js and PostgREST, with real accounts created through the admin API (`tests/database/*.test.ts`).
- It runs on the live local database, which has the permissive local default privileges.
- It has no anonymous client.
- Some fixtures go through the service-role client.

Things this Vitest suite cannot check, but the raw-SQL scripts do:

- inserting data part-way through the chain;
- running statements as a privileged role (`reset role`);
- two real concurrent connections (market-prices `:39–52`, snapshots `:46–71`);
- catalogue queries;
- `cron.job`.

| Rule family          | Covered in Vitest / unit tests                                                                                                                                                                                                                                                 | Only in raw-SQL scripts                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS isolation        | positions and wallets reads/updates `decimal.test.ts:189–213`; snapshots `wallet-snapshots.test.ts:57`; cache `market-prices.test.ts:111`; targets/receipts `market-selections.test.ts:131–150`; lookups `market-prices.test.ts:174–181`; view `market-prices.test.ts:112–114` | `reason_categories` isolation; foreign cache insert; **all anonymous access**                                                                                                                                              |
| Grants               | `wallet_id` direct update gets 42501 (`effective-valuations.test.ts:159`); retired lookup RPCs get 42501 (`market-prices.test.ts:190–206`, re-checked at `:204`); capture refused for signed-in users (`wallet-snapshots.test.ts:58`)                                          | revoked `market_listing_id`/`listing_confirmed_at`/`market_target_id`/`market_selection_receipt_id` columns; service_role can capture; anon; **every policy backed by a grant without defaults**                           |
| Constraints          | sale pair, non-negative, after buy, by constraint name (`decimal.test.ts:315–372`, re-checked at `:337–339`)                                                                                                                                                                   | hard-delete refusal; wallet unique name, non-negative, no delete (unit and form level only: `write-failures.test.ts:87`, `wallet.test.ts:17`); `market_target_id NOT NULL`; guard re-enabled and privileged change refused |
| Effective selection  | automatic (`market-prices.test.ts:93–106`, `effective-valuations.test.ts:131–132`); manual override (`effective-valuations.test.ts:142–148`); manual fallback (`market-selections.test.ts:233–238`); cooldown keeps automatic (`market-prices.test.ts:127–138`)                | sale wins; missing; equal versus strictly later market time; identical resave re-stamps; spoofed timestamp refused                                                                                                         |
| Leases and cooldowns | target leases: concurrency, foreign finish, expiry, late token (`market-selections.test.ts:152–192`); quote release (`market-prices.test.ts:225–238`)                                                                                                                          | **quote-cache** concurrent claims, claim refused during cooldown, late worker, older quote, foreign finish                                                                                                                 |
| Wallet moves         | incompatible, foreign target, direct update refused, facts unchanged (`effective-valuations.test.ts:151–163`)                                                                                                                                                                  | none on the final schema. `currency_required` is tested only in the intermediate stage                                                                                                                                     |
| Snapshots            | paginated signed totals, foreign read, capture refused, update refused (`wallet-snapshots.test.ts:36–61`)                                                                                                                                                                      | arithmetic oracle, concurrent idempotency, immutable history, exactness beyond `numeric(20,8)`, insert/delete refused, anon read, source counts                                                                            |
| Cron                 | none                                                                                                                                                                                                                                                                           | everything (`test-wallet-cron.mjs` plus the migration's own checks)                                                                                                                                                        |

Gap: worker 3 identified unit tests under `src/**` from test names and greps, not full reads. `scripts/testing/smoke.mjs` also checks cross-account isolation over HTTP (`scripts/README.md:19`) and was not compared in detail.

### 5. Duplicated setup (worker 2)

- **Container name** `supabase_db_investments-diary`: hard-coded in all 8 SQL scripts.
- **createdb / random name / dropdb in `finally`:** 7 files, each with its own prefix (wallet `:8,98,102`; close `:8,115,119`; snapshots `:6,23,113`; policy `:11,28,68`; market-prices `:8,55,270`; required `:9,47,175`; recovery `:9,53,142`).
- **Fake `auth` schema plus `auth.uid()` from `request.jwt.claim.sub`:** identical text in 7 files.
- **Migration discovery** (`readdirSync`, excluding `20261028170000_register_daily_wallet_snapshot_job.sql`): 6 files. `test-wallet-database.mjs` names its four migrations instead.
- **Three process helpers:** `spawnSync` (wallet, close), `execFileSync` with or without `-Atq` (the rest), and `spawn` for concurrency (market-prices, snapshots). Assertion helper `do $$ … raise exception` is defined three times (market-prices `:24`, required `:17`, recovery `:17`). Role switching `set role authenticated; set request.jwt.claim.sub=…` is written inline about 10 times.
- **Fixture UUID prefixes are inconsistent:** `10000000-…` means a reason category in wallet/close and a wallet elsewhere, and both at once in market-prices `:63` and recovery `:63–64`.

### 6. What depends on these scripts (worker 3)

Live dependencies (renaming or removing a script breaks these):

- `package.json`: `test:close-db`, `test:wallet-db`, `test:decimal-db`, `test:snapshots-db`, `test:wallet-cron`, `test:market-prices-db` (chains three files), `test:grants-db`.
- `.github/workflows/ci.yml`: the `decimal-transport` steps at `:56–66` and the `smoke` step at `:89`.
- `.claude/skills/verify/SKILL.md:12–18`: run `npm run test:decimal-db` when numeric or Supabase paths change.
- `README.md:243`: a human runbook line for `test:snapshots-db` and `test:wallet-cron`.
- `scripts/README.md`:
  - table `:21–25`;
  - prose `:90–92, 104`;
  - `test-policy-grants.mjs` / `test:grants-db` is missing from it.
- `context/deployment/deploy-plan.md`:
  - `:311` is a recovery step: "rehearse … `npm run test:market-prices-db`";
  - `:335` and `:370`;
  - the verification matrix `:379–388` names most scripts.
- `context/changes/automatic-stock-prices/plan.md:243, 261, 296`: the change still owns the recovery and required-selection scripts. Phase 6 is not checked off.
- `tests/database/decimal.test.ts:4, 34`: a comment and an error message pointing to `npm run test:decimal-db`.
- `test-market-price-recovery.mjs:26–28` reads `context/deployment/automatic-stock-prices-manual-selection.sql` by path.

Historical records (no action needed): `context/changes/automatic-stock-prices/verification.md`, and the plans and reviews of the archived changes `2026-10-19-result-correctness`, `2026-10-19-named-wallets`, `2026-10-27-close-position` and `2026-10-28-wallet-performance-dashboard`.

## Code References

- `scripts/testing/database/test-close-database.mjs:47`: blanket hand grant after the full chain (masks `:102–104`, `:109`).
- `scripts/testing/database/test-wallet-database.mjs:22–37`: four-migration replay plus a blanket hand grant.
- `scripts/testing/database/test-market-prices-database.mjs:70`: hand grant to `authenticated, anon` mid-chain.
- `scripts/testing/database/test-market-prices-database.mjs:83–229`: permanent rules checked only on the intermediate schema.
- `scripts/testing/database/test-market-prices-database.mjs:232–249`: denomination revision transition checks.
- `scripts/testing/database/test-required-selection-migration.mjs:96–113`: Apple backfill transition checks.
- `scripts/testing/database/test-required-selection-migration.mjs:118–172`: final-schema selection and privilege rules.
- `scripts/testing/database/test-policy-grants.mjs:36–63`: policy-grant invariant, views, anon.
- `scripts/testing/database/test-snapshots-database.mjs:46–108`: concurrency and snapshot rules (no hand table grants).
- `tests/database/decimal.test.ts:315–372`: sale constraints through PostgREST.
- `tests/database/market-prices.test.ts:190–206`: retired lookup RPCs get 42501.
- `supabase/migrations/20261102150000_grant_core_table_access.sql:1–9`: grants that replaced the local defaults.

## Architecture Insights

- **The two kinds of test complement each other.** The Vitest suite proves application paths through PostgREST with real sessions, but it can't see grant gaps (local defaults) or anonymous access. Raw SQL can check the catalogue, privileged-role behaviour, concurrent connections and cron.
- **A fair consolidated test runs without default privileges or hand grants.** `test-policy-grants.mjs` and `test-snapshots-database.mjs` already do this. Together with the local stack's permissive default privileges (which the Vitest suite runs under), the masking grants kept local runs and CI from reproducing production's `42501`.
- **Transition checks belong next to their migration only while that migration may still be applied to existing data.** Production applied the full chain on 2026-11-02. Fresh test databases have no legacy rows. After Phase 6 acceptance the transition checks have no remaining target, except as historical evidence.

## Historical Context (from prior changes)

- `context/archive/2026-10-19-named-wallets/plan.md:148`: the wallet test deliberately used "a disposable pre-wallet database". That's why it stops at four migrations.
- `context/archive/2026-10-27-close-position/plan.md:140`: "Extend existing runners rather than adding a new test platform". That decision is how each feature ended up with its own runner.
- `context/archive/2026-10-28-wallet-performance-dashboard/verification.md:21`: pg_cron installs only in its configured database, so domain suites exclude the cron migration and `test-wallet-cron.mjs` runs inside a rolled-back transaction.
- `context/changes/automatic-stock-prices/verification.md:119–124`: the competing-connection and lease checks, with deliberate breaks proving the equal-timestamp rule.
- `context/changes/automatic-stock-prices/verification.md:291–293`: the required-selection fixture was already narrowed once after a hand grant hid a revoke.
- `test-policy-grants.mjs:1–5` and `20261102150000:1–6`: within the searched paths (`context/changes/**`, `context/archive/**`, `scripts/README.md`), the only record of why the policy-grants test exists (the production `42501` on 2026-11-02). No plan or verification entry records it.

## Related Research

- [automatic-stock-prices research](../automatic-stock-prices/research.md): the original code map for the market-price feature. Not re-read for this question.

## Open Questions

1. **Prerequisite:** `automatic-stock-prices` Phase 6 (rows 6.1–6.3) is not accepted. Roadmap F-01 says the transition checks stay until then. The plan must sequence removals after acceptance.
2. **Where permanent rules should live (design choice for `/10x-plan`):** should the uncovered permanent rules go into one raw-SQL contract test, or into the Vitest suite? The Vitest suite can't check catalogue state, privileged roles, `cron.job` or default-privilege-free grants.
3. **Whether to keep transition evidence at all:** delete it after acceptance, as F-01 says, or keep a frozen record in `verification.md`?
4. **`currency_required` move outcome:** is tested only in the intermediate stage (`test-market-prices-database.mjs:206`). Check whether `move_position_to_wallet` on the final schema can still return it. If not, it's an obsolete branch and nothing needs to replace the check.
5. **Inferred, not executed:** that `test-wallet-database.mjs:58, 84–87, 92` and `test-close-database.mjs:102, 109` would raise `42501`/`not_null_violation` on the final schema without hand grants. A planning-phase deliberate run would confirm it.
6. **Live references to update** if scripts are renamed or merged: `package.json`, `ci.yml`, the verify skill, `README.md:243`, `scripts/README.md`, `deploy-plan.md:311, 379–388`, `decimal.test.ts:4, 34`. `scripts/README.md` already lacks `test:grants-db`.
