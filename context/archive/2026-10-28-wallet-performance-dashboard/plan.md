# Wallet performance dashboard — implementation plan

## Summary

Add a daily midnight-UTC recorded wallet-value timeline, current realised/open breakdown, and a reusable local demo with about 100 investments and synthetic history. Preserve historical observations; genuine history starts at activation.

## Current State Analysis

Only latest manual quotes survive. Existing exact wallet arithmetic includes realised/open results. Reuse wallet helpers, components, chart tokens, owner isolation and local runners.

## Desired End State

Users inspect daily observations independently of live totals through accessible ranges and point details; safe demo seeding makes manual testing immediate.

## What We Are NOT Doing

No live prices, reconstructed price history, cash flows, allocation analytics, benchmarks, sale corrections or missed-day backfill. No production activation/deployment in this task.

## Implementation Approach

Exact database daily snapshots with pg_cron and owner-only paginated reads; React SVG with SSR fallback.

## Phase 1: Daily wallet observations

### Changes Required

**Intent:** Daily wallet observations.

**Contract:** Add additive wallet_snapshots storage: owner/wallet identity, UTC day, actual captured timestamp, starting/total value, realised/open amounts, contribution/exclusion counts and oldest counted open quote. Exact unrestricted numerics travel as text; signed aggregate decoding must not use the price decoder. One point per wallet/day, first success retained. Owner-only SELECT RLS; no client writes or public capture execution. Restricted SQL capture uses a consistent statement snapshot and the existing formula, including zero sales, missing data and empty wallets. Add typed paginated reads. Schedule midnight UTC through pg_cron using a versioned infrastructure migration. Applying that migration activates the schedule; production migration deployment remains separate. No migration backfill.

### Success Criteria

#### Automated Verification

- Migration and database tests prove exact totals, daily idempotency, concurrent capture safety and owner-only access.

- Literal financial fixtures produce identical snapshot and application totals, contribution counts and freshness.

## Phase 2: Wallet dashboard

### Changes Required

**Intent:** Wallet dashboard.

**Contract:** Keep live summary and investment table; add current realised/open profit amounts and exclusion context. React SVG using existing tokens, no new chart dependency. Rolling UTC 30/90/365-day and All ranges, default 90; include today. Hover/focus/tap details expose exact timestamps, values, contributions and quote freshness. Clearly label recorded daily values and manual-price source; live summary is distinct. Missing days break lines; single points remain visible. Empty and failed reads are distinct. Normalise BigInt values before bounded SVG coordinate conversion. Server-rendered default chart and expandable table work without JS. Retain current percentage convention; no selected-period return metric.

### Success Criteria

#### Automated Verification

- Unit and SSR tests cover range boundaries, negative/flat/large values, gaps, empty/single-point states, exact labels and separate live/history errors.

- Dashboard tests prove current realised/open amounts and exclusions match the existing wallet calculation.

#### Manual Verification

- Desktop/mobile, keyboard, touch and no-JavaScript checks confirm readable charts, point details and fallback data.

## Phase 3: Reusable local demo data

### Changes Required

**Intent:** Reusable local demo data.

**Contract:** npm run seed:demo [--reset] provisions only local Supabase, using private CLI credential discovery. Fixed confirmed demo email, seed marker and DEMO_USER_PASSWORD; refuse unmarked collisions and never print password/keys. About100 investments across rising/falling/mixed/flat/empty wallets include varied reasoning, missing data, deleted records, zero sales. One year synthetic observations with gaps and current final values. Deterministic IDs; reruns fill missing fixtures without overwriting edits. Explicit reset replaces recognised fixtures only and first refuses unrelated references. No database reset or hosted credentials. Document use.

### Success Criteria

#### Automated Verification

- Seed tests prove first-run creation, duplicate-free reruns, preservation of edits, scoped reset, collision refusal and nonlocal rejection.

#### Manual Verification

- Signing into the demo account exposes all five scenarios and useful history immediately.

## Phase 4: Acceptance and scheduling verification

### Changes Required

**Intent:** Acceptance and scheduling verification.

**Contract:** Extend existing local DB, SSR/HTTP and Playwright tests: immutable history after changes/close/delete/restore, next capture values, retries, unchanged days, gaps, owner isolation, controls, reload, keyboard/touch/noJS. Verify restricted capture directly and cron registration without waiting midnight. Document job history, missing captures and named-job disable/forward fix without deleting observations. Update FR-013 with daily observation and accepted realised-result rules.

### Success Criteria

#### Automated Verification

- Local integration and browser tests pass for preserved history, capture idempotency, ranges, point interaction, reload and isolation.

- Verification passes in order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`; then `npm test`, `npm run test:decimal-db`, the snapshot database suite and local HTTP smoke.

#### Manual Verification

- The seeded desktop/mobile dashboard clearly distinguishes live totals, daily observations, stale prices and missing data; deployment documentation identifies the daily job and its last successful run.

## Testing Strategy

Literal oracle: starting 1000 + realised 100 + open 40 = 1140; deleting realised record makes live 1040 while old 1140 persists. Next capture records 1040. Cover exact negative/large aggregates, immutable history, gaps and local seed safety.

## Performance Considerations

Set-based capture, indexed owner/wallet/day reads, paginate all history and avoid per-position queries. Retain observations.

## Migration Notes

Install storage before scheduler activation. No historic backfill; missed observations remain gaps. Production activation follows deployment procedures.

## References

- src/lib/wallet.ts
- src/pages/dashboard/wallets/[id].astro
- scripts/testing/database/test-decimal-database.mjs
- https://supabase.com/docs/guides/cron

## Progress

### Phase 1: Daily wallet observations

#### Automated

- [x] 1.1 Migration and database tests prove exact totals, daily idempotency, concurrent capture safety and owner-only access.

- [x] 1.2 Literal financial fixtures produce identical snapshot and application totals, contribution counts and freshness.

### Phase 2: Wallet dashboard

#### Automated

- [x] 2.1 Unit and SSR tests cover range boundaries, negative/flat/large values, gaps, empty/single-point states, exact labels and separate live/history errors.

- [x] 2.2 Dashboard tests prove current realised/open amounts and exclusions match the existing wallet calculation.

#### Manual

- [ ] 2.3 Desktop/mobile, keyboard, touch and no-JavaScript checks confirm readable charts, point details and fallback data.

### Phase 3: Reusable local demo data

#### Automated

- [x] 3.1 Seed tests prove first-run creation, duplicate-free reruns, preservation of edits, scoped reset, collision refusal and nonlocal rejection.

#### Manual

- [ ] 3.2 Signing into the demo account exposes all five scenarios and useful history immediately.

### Phase 4: Acceptance and scheduling verification

#### Automated

- [x] 4.1 Local integration and browser tests pass for preserved history, capture idempotency, ranges, point interaction, reload and isolation.

- [x] 4.2 Verification passes in order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`; then `npm test`, `npm run test:decimal-db`, the snapshot database suite and local HTTP smoke.

#### Manual

- [ ] 4.3 The seeded desktop/mobile dashboard clearly distinguishes live totals, daily observations, stale prices and missing data; deployment documentation identifies the daily job and its last successful run.
