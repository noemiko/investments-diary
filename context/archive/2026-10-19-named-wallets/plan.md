# Named Wallets — Implementation Plan

## Overview

Complete the existing wallet implementation for roadmap S-09 / FR-013. Authors can create and edit named wallets, assign each investment to one wallet, inspect its members, and see totals with clear missing-data and price-date information.

## Current State Analysis

The working tree contains wallet migrations, services, forms, investment selection, calculation tests and partial HTTP smoke coverage. Preserve and verify this work. Missing pieces include visible membership, protection against direct soft deletion, broader integration coverage and unit tests in CI. Migration history must be inspected before SQL edits.

## Desired End State

Every investment belongs to exactly one owned wallet. Wallets support creation/editing but no deletion. List/detail show linked wallet names; wallet pages show totals, members and an edit form. Deleted investments retain assignment but disappear from membership and totals until restored.

Wallet value is starting value plus the sum of (current price − buy price) × quantity. Investments missing quantity or current price are excluded with a visible count. State the oldest included price date. Empty wallets show starting value and “No priced positions”; zero starting value has no percentage change.

### Key Discoveries

- Existing calculation reuses the position-result helper; totals are computed, not stored.
- Existing migration backfills all entries into Main at 0.
- Wallet detail is currently edit-only.
- CI omits unit tests and runs smoke after merge.

## What We’re NOT Doing

Closing positions or realised returns (S-04), reassignment (S-07), wallet deletion, live prices, currencies, fees, broker accounts or wallet-specific confrontation. Confrontation remains diary-wide.

## Implementation Approach

Preserve useful existing changes. Extend request-scoped Supabase services and server-rendered forms. Reuse the shared result calculation and position presentation. Enforce ownership and no deletion at the database boundary.

## Phase 1: Wallet data and ownership

### Overview

Make wallet ownership and migration behaviour match the agreed rules without losing investments.

### Changes Required

**Files:** wallet migrations and rollback under `supabase/`; wallet validation, services and database types.

**Intent:** Preserve mandatory ownership and safe backfill while completing deletion protection.

**Contract:**

- Every investment references exactly one wallet owned by the same author through a composite foreign key.
- Existing investments, including deleted ones, move to one Main wallet per owner with starting value 0; owners without investments create their first wallet explicitly.
- Names are trimmed, 1–60 characters and unique per author ignoring case; starting values are nonnegative.
- Prevent non-null wallet `deleted_at` through a database constraint and retain no authenticated DELETE policy.
- Use request-scoped clients; missing and foreign wallets remain indistinguishable.
- Inspect migration history before editing SQL. Preserve applied migrations and use forward corrections. Avoid partial rerun guards in new migrations.

### Success Criteria

#### Automated Verification

- Migration fixtures preserve existing and deleted investments, assign one owned wallet each, and leave owners without investments without a wallet.
- Authenticated database tests reject foreign-wallet assignment, wallet hard deletion and wallet soft deletion.
- Wallet validation tests cover trimmed names, duplicate names, zero, negative, localized and out-of-range starting values.

#### Manual Verification

- A migrated author sees “Main” at 0 and can correct its name and starting value.

## Phase 2: Visible wallet grouping

### Overview

Make wallet membership inspectable and explain which investments contribute to a total.

### Changes Required

**Files:** position services/types and presentation; wallet routes and investment-entry form.

**Intent:** Show membership consistently while preserving current forms and result calculations.

**Contract:**

- Extend PositionListItem and position detail with wallet_id and wallet_name through the owned-wallet relationship.
- Link wallet names from dashboard investment rows and position detail.
- Add an optional wallet filter to the position-list service, preserving sorting and deleted-entry exclusion.
- Keep /dashboard/wallets as the summary; extend /dashboard/wallets/[id] with its total and members followed by the existing edit form.
- Member rows link to position detail and show category and dated result.
- Preserve automatic selection of a sole wallet; multiple wallets require explicit selection. No-wallet entry links to wallet creation.
- Rename reflects everywhere through relationships; starting-value edits immediately affect totals.
- Failed member queries show errors, never empty membership or starting-value-only totals. Missing and foreign routes return 404.
- Derive a wallet page total from the same eligible member dataset.
- Read all matching positions in batches through the same request-scoped client, preserving RLS and deleted-entry/wallet filters. Order each query deterministically with a unique id as the final key. Any failed batch rejects the entire read; never compute totals from a partial result.

### Success Criteria

#### Automated Verification

- HTTP tests verify linked membership on investment list/detail and correct member isolation between two wallets.
- HTTP tests verify wallet editing, duplicate-name rejection and retained form values after validation failure.
- Unit tests verify gains, losses, decimals, excluded counts, oldest included date, empty wallets and zero starting value.
- Service regression tests verify complete summary and member reads beyond the API row cap, retained request identity/filters and rejection on a later batch failure.

#### Manual Verification

- Wallet creation, selection, membership navigation and editing work with keyboard navigation and at mobile width.
- Investment recording remains practical within the PRD’s 60-second target once a wallet exists.

## Phase 3: Integration and acceptance

### Overview

Turn partial coverage into evidence that grouping, totals and privacy work together.

### Changes Required

**Files:** wallet tests, smoke script and CI workflow.

**Intent:** Verify the entire feature and run unit tests in CI.

**Contract:**

- Cover positive priced totals, successful edits, duplicate names and delete/restore recalculation in smoke tests.
- Test signed-out access and cross-account list, detail, update and assignment attempts.
- Run npm test in the existing CI job before build.
- Keep HTTP smoke tests; do not introduce Playwright.
- Record verification honestly; existing uncommitted code does not justify prechecked Progress.

### Success Criteria

#### Automated Verification

- `npm test`, `npm run lint`, `npx astro check` and `npm run build` pass.
- Local `npm run smoke` passes against a migrated disposable Supabase instance and running app.
- Integration tests verify priced totals, edit results, duplicate names, ownership and delete/restore recalculation.
- Capped-transport service tests with 1,200 and 2,400 positions across two wallets verify summary/detail totals, member counts, exclusions and oldest dates, including more than 1,000 positions in one wallet.

#### Manual Verification

- A two-wallet walkthrough shows correct members, totals, excluded counts and oldest included dates.
- Existing price-update, deletion/restoration and diary-wide confrontation flows remain usable.

## Testing Strategy

Use independent expected values: starting value 1,000 plus gain 100 minus loss 40 is 1,060. An excluded investment's older date must not determine the total date. Test existing owners, deleted entries and empty owners. Use authenticated database credentials for ownership restrictions. Keep UI checks distinct from HTTP and persistence tests.

## Performance Considerations

Batch wallet summary reads; avoid one query per wallet. Fetch positions in ranges of 500, advancing by the actual response length until an empty batch so lower API caps cannot silently truncate totals. These sequential reads are not a transaction snapshot; concurrent edits can affect results during a read. Filter membership in the database using the wallet index. Do not store totals or introduce background refresh.

## Migration Notes

Apply schema before application code requiring assignment. Inspect history and test a disposable pre-wallet database. Preserve unrelated work. The draft rollback destroys wallet metadata and assignments; use forward repairs after real data exists. Production migration, deployment and publication are separate actions.

## References

- context/foundation/prd.md: FR-013 and question 6.
- context/foundation/roadmap.md: S-09, S-04, S-07.
- context/foundation/lessons.md: migrations and CI.
- src/lib/wallet.ts:25: shared calculation.
- src/lib/services/wallets.ts:52: eligible position reads.
- src/pages/dashboard/new.astro:83: sole-wallet selection.
- .github/workflows/ci.yml:28: CI.

## Progress

> Only verified steps are checked. Manual items require human confirmation.

### Phase 1: Wallet data and ownership

#### Automated

- [x] 1.1 Migration fixtures preserve existing and deleted investments, assign one owned wallet each, and leave owners without investments without a wallet.
- [x] 1.2 Authenticated database tests reject foreign-wallet assignment, wallet hard deletion and wallet soft deletion.
- [x] 1.3 Wallet validation tests cover trimmed names, duplicate names, zero, negative, localized and out-of-range starting values.

#### Manual

- [x] 1.4 A migrated author sees “Main” at 0 and can correct its name and starting value.

### Phase 2: Visible wallet grouping

#### Automated

- [x] 2.1 HTTP tests verify linked membership on investment list/detail and correct member isolation between two wallets.
- [x] 2.2 HTTP tests verify wallet editing, duplicate-name rejection and retained form values after validation failure.
- [x] 2.3 Unit tests verify gains, losses, decimals, excluded counts, oldest included date, empty wallets and zero starting value.
- [x] 2.6 Service regression tests verify complete summary and member reads beyond the API row cap, retained request identity/filters and rejection on a later batch failure.

#### Manual

- [x] 2.4 Wallet creation, selection, membership navigation and editing work with keyboard navigation and at mobile width.
- [x] 2.5 Investment recording remains practical within the PRD’s 60-second target once a wallet exists.

### Phase 3: Integration and acceptance

#### Automated

- [x] 3.1 `npm test`, `npm run lint`, `npx astro check` and `npm run build` pass.
- [x] 3.2 Local `npm run smoke` passes against a migrated disposable Supabase instance and running app.
- [x] 3.3 Integration tests verify priced totals, edit results, duplicate names, ownership and delete/restore recalculation.
- [x] 3.6 Capped-transport service tests with 1,200 and 2,400 positions across two wallets verify summary/detail totals, member counts, exclusions and oldest dates, including more than 1,000 positions in one wallet.

#### Manual

- [x] 3.4 A two-wallet walkthrough shows correct members, totals, excluded counts and oldest included dates.
- [x] 3.5 Existing price-update, deletion/restoration and diary-wide confrontation flows remain usable.
