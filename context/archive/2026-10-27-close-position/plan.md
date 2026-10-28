# Close position implementation plan

## Overview

Implement FR-007 / roadmap S-04: the author closes an entire position with a sell price and date, then sees its final percentage result throughout the diary. Include realised gains and losses in wallet totals under FR-013. Decisions and phase structure were approved during the planning interview on 2026-10-27; documents saved on 2026-10-28.

## Current State Analysis

Positions have purchase facts and an optional latest current-price/date pair, but no sale state. The detail page handles native price-form POSTs. Lists, detail, wallet member rows and the React confrontation reuse the same exact-decimal result calculation. Wallet values currently sum non-deleted positions' current-price results.

Existing ownership RLS remains the access boundary. Application queries additionally exclude soft-deleted positions. Numeric database reads deliberately project decimal columns as text; domain calculations use BigInt and round only for display. Position results are percent-only by an earlier explicit author decision.

## Desired End State

An open position offers a separate close form with required sell price, sell date and an acknowledgement checkbox. A successful submission persists both sale facts atomically and redirects to the detail page. Closed positions remain in lists, wallet membership and matching confrontation history, showing a final percentage and sale date. Their detail page shows sale facts and no price-update or close form.

The seven approved choices are: full close only; zero sell price allowed; corrections/reopening deferred; realised gains included in wallets; sale dates may precede a later manual quote; explicit acknowledgement required; wallet freshness reflects counted open quotes only.

### Key Discoveries:

- `src/lib/services/positions.ts:126`: price writes already use conditional updates and detect zero affected rows; extend this pattern to closing and open-only price updates.
- `src/lib/result.ts:25`: one pure calculation serves all result surfaces and wallet arithmetic.
- `src/components/positions/PositionResult.astro:6`: manually reconstructed props must explicitly carry the new sale fields.
- `src/lib/services/decimal.ts:4`: the strict decoder currently covers purchase/current prices and must decode nullable sale prices while allowing zero.
- `context/foundation/roadmap.md:124`: S-04 requires final results throughout the diary and leaves wallet policy to this change; the interview resolves it below.

## What We're NOT Doing

- Partial sales, transaction history, fees, currencies, dividends or proceeds/cash accounting.
- Sale corrections, reopening or broader factual editing; these remain with S-07. The acknowledgement explicitly states that correction is not yet available.
- Changing the percent-only position-result display, original reasoning or list ordering.
- Live prices, new infrastructure, general auth redesign or a broader testing-platform rollout.

## Implementation Approach

Use an additive sale-price/date pair on the existing position. A complete pair means closed; no redundant status column. Preserve the previous current quote as historical stored data but ignore it for closed-result calculations. Reuse native server-rendered forms, request-scoped Supabase clients, existing decimal utilities, error reporting and test runners. No new dependencies or RPC are needed.

## Critical Implementation Details

### State sequencing

Closing must be a single update conditional on the position still being open and non-deleted. Checking a previously loaded row alone cannot prevent competing submissions from overwriting the first sale. Current-price writes also require an open-state predicate so a stale form cannot update a closed position.

### Decimal transport

Zero is a valid sale, so neither truthiness checks nor the positive-only current-price decoder can establish sale presence. Select sale prices as text on every read, accept zero in sale validation/decoding, and retain BigInt arithmetic.

## Phase 1: Sale data and guarded writes

### Overview

Add the sale contract, exact decimal transport, validation and safe mutation service.

### Changes Required:

#### 1. Database and type contracts

**Files**: new timestamped migration under `supabase/migrations/`; `src/db/database.types.ts`, `src/db/api.types.ts`, `src/types.ts`.

**Intent**: Store sale facts without altering existing entries or conflating closure with deletion.

**Contract**: Add nullable `sell_price numeric(20,8)` and `sell_date date`, with named constraints requiring both or neither, price at least zero and sale date on/after buy date. Existing rows remain open. Use an unguarded additive migration consistently, in line with lessons.md; retain existing RLS. Regenerate database types, extend string-valued decimal write types, and carry sale fields in list/detail/confrontation/wallet result DTOs. Introduce `ClosePositionInput`, form values/errors and the two sale fields; acknowledgement is a form concern, not persisted data.

#### 2. Validation and service mutation

**Files**: new `src/lib/validation/close-position.ts`; `src/lib/services/positions.ts`, `src/lib/services/wallets.ts`, `src/lib/services/decimal.ts`.

**Intent**: Validate a complete close and reject stale writes while preserving exact prices and ownership isolation.

**Contract**: Read and validate `sell_price`, `sell_date` and a checked acknowledgement. Accept existing comma/dot/grouped decimal syntax within numeric(20,8), including zero; reject negatives, excess precision and out-of-range values. Require a real date between buy date and `todayUtc()` inclusive, defaulting to UTC today. Do not compare sale date with the retained quote date. Add `closePosition(client, id, input)` returning success or `not_found`, `validation`, `unexpected`; write only the sale pair, filtered by id, non-deleted and open state. Zero affected rows use the existing generic unavailable/not-found contract and never reveal foreign ownership. Repeat closes cannot overwrite the first sale. Guard `updatePositionPrice` with the same open predicate. Expected outcomes stay quiet; unexpected failures report once under the operation name.

Extend every affected numeric projection with `sell_price::text, sell_date`, including wallet summary reads, and decode nullable sell prices with zero allowed. Preserve pagination and existing filters.

### Success Criteria:

#### Automated Verification:

- Local migration and database tests prove pair/date/nonnegative constraints, existing-row compatibility and unchanged ownership isolation.
- Validation and service tests prove zero/precision/date boundaries, required acknowledgement, conditional writes and expected/unexpected error classification.
- Exact decimal read/write tests pass for sale fields across list, detail, confrontation and wallet services, including `npm run test:decimal-db`.

## Phase 2: Closing flow and final results

### Overview

Expose closing in the detail view and apply sale results consistently across the diary and wallets.

### Changes Required:

#### 1. Native close form and closed detail

**File**: `src/pages/dashboard/positions/[id].astro`.

**Intent**: Let the author deliberately record a complete exit and understand the resulting state.

**Contract**: Distinguish price and close submissions with an explicit form action field. Preserve existing price submissions without that field as price updates; reject unknown actions without a write. The close form starts with blank sell price, UTC today and an unchecked acknowledgement: “I am closing the entire position. Sale corrections and reopening are not available yet.” Validate acknowledgement server-side. Invalid input or a write failure preserves submitted values and shows field/form errors. Success uses POST/redirect/GET. A closed detail shows a Closed marker, sell price/date and final result, with both write forms absent. Delete/restore remains available and retains the sale pair. Load/save failure text names the attempted action instead of always referring to price updates.

#### 2. Shared final-result contract and rendering

**Files**: `src/lib/result.ts`; `src/components/positions/PositionResult.astro`, `PositionsTable.astro`, `ConfrontationPanel.tsx`; detail-page call sites and relevant fixtures.

**Intent**: Show the outcome of the sale everywhere without stale quote leakage or changed arithmetic precision.

**Contract**: Extend `PositionResultInput` with the nullable sale pair. `positionResult` uses sale price/date when closed and current price/date otherwise, exposes open/closed result kind, and keeps the existing exact percent/amount contracts. A closed position needs no prior current quote; missing quantity still permits a percentage but gives no amount. Keep existing open wording and `No price yet`; closed result wording is `Final <percent> · sold <formatted date>`. Carry sale props explicitly through Astro wrappers and use the same description in React. Show a Closed marker on detail, table rows and confrontation records. Do not filter closed positions out of history.

#### 3. Wallet realised results and freshness

**Files**: `src/lib/wallet.ts`, `src/components/wallets/WalletValue.astro`, affected wallet consumers/tests.

**Intent**: Preserve accumulated performance when a position closes while making quote freshness honest.

**Contract**: Wallet value is starting value plus realised amounts from closed positions plus unrealised amounts from open positions, always excluding soft-deleted rows. A closed position is counted when quantity exists, even with no current quote. Missing quantity or an open position's missing quote increments `notCounted` as before. Preserve `counted` as the total contributing records; add realised/open contribution counts to support date wording. `asOf` is the oldest quote date among counted open positions only. Display “Open prices as of <date>” and, when relevant, “Includes realised gains/losses”; with only closed contributions use “Realised results only”; with no contributions use “No counted results”. Exclusion wording becomes “not counted (no quantity or no current price for an open position)”. A starting value of zero still has no percentage change.

### Success Criteria:

#### Automated Verification:

- Unit and SSR tests prove sale precedence, zero-price total loss and identical final percentage/date wiring across detail, list, wallet members and confrontation.
- Wallet tests prove realised/open sums, missing-data counts and open-only freshness, including realised-only and empty cases.
- Route/render tests prove action dispatch, preserved errors, required acknowledgement and absence of write forms on closed detail.

#### Manual Verification:

- The closing form works with JavaScript disabled, errors remain readable, and the closed detail clearly shows the sale and final result at desktop and mobile widths.

## Phase 3: Verification

### Overview

Prove persistence, isolation, concurrent-write behavior and consistency of the complete close flow.

### Changes Required:

#### 1. Local integration and HTTP acceptance coverage

**Files**: `tests/database/decimal.test.ts`, existing service/SSR suites, `scripts/smoke.mjs` and existing local database launcher configuration as needed.

**Intent**: Test the failure scenarios at the cheapest layer that demonstrates the actual contract.

**Contract**: Extend existing runners rather than adding a new test platform. Authenticated local database tests cover two competing closes: exactly one succeeds and the stored pair matches that complete submission. Also prove a stale price update after close fails, another account cannot close/reprice/read it, and missing/deleted ids do not disclose ownership. An HTTP walk closes a position, follows the redirect, reloads it, and verifies final results in dashboard, wallet members and same-reason history. A subsequent delete/restore round trip preserves sale facts and removes/reinstates the wallet contribution. Fresh migration-chain verification uses a disposable database, never resets the author's diary. Extend unexpected-write reporting coverage for the close operation without capturing financial form values.

### Success Criteria:

#### Automated Verification:

- Local database and HTTP tests pass for competing closes, stale price updates, foreign/deleted/missing ids, reload persistence and delete/restore preservation.
- The repository verification sequence passes in order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`; `npm test`, `npm run test:decimal-db` and the local HTTP smoke walk also pass.

#### Manual Verification:

- A mixed open/closed wallet and the same-reason history show the agreed results and date labels; a mistaken repeat close never replaces the saved sale.

## Testing Strategy

Use literal, independently calculated expectations. Buy 50, sell 60, quantity 10 gives +20.00% and realised amount 100; sell zero gives -100.00% and amount -500. Wallet starting at 1,000 plus realised gain 100 and open gain 40 gives 1,140; deleting the closed record gives 1,040, restoring it gives 1,140. Give the closed sale an older date than the open quote and assert wallet freshness still uses the open quote. Without quantity, display the percentage and increment the wallet exclusion count.

Cover a close without a current quote, a sale preceding the retained quote, same-day purchase/sale, pre-buy/future/impossible dates, absent acknowledgement, negative price, eight-decimal and upper-bound transport, gains/losses/break-even and existing rounding boundaries. Rendering fixtures must use different sale/current prices and dates so dropped sale props fail visibly. Follow the existing test-plan cookbook for meaningful fault checks; no whole-page snapshots are needed.

Manual walkthrough: reject invalid input, complete a zero-price close, reload, inspect all result surfaces and wallet wording, then delete and restore. Use only local Supabase and a local dev server for account-creating tests; `astro preview` is unsupported here. Verification belongs to implementation; no product tests were executed during planning.

## Performance Considerations

Closure uses one conditional update, and sale fields travel in existing reads. Reuse current pagination; no per-position lookup or client fetch is introduced.

## Migration Notes

Apply the additive migration before deploying code that selects sale columns. Existing rows stay open and no price/reason data is rewritten. Future-date validation follows existing application rules rather than a time-varying database check. Preserve the sale columns during any rollback: reverting to old code would render closed holdings as open, so disable close writes and use a forward fix rather than presenting old quote results as final outcomes. Do not drop recorded sale data.

When saving this plan, advance the change to `planned` and S-04 to `planning`. The accepted wallet interpretation resolves the S-04 wallet question; this plan is its decision record. Any later implementation PR should reference these decisions and update relevant product wording to remove the old ambiguity. Planning itself authorizes no product implementation, commit, PR or deployment.

## References

- `context/changes/close-position/change.md` — change intent.
- `context/foundation/prd.md` — FR-006, FR-007, FR-009, FR-010–013 and privacy/data-loss guardrails.
- `context/foundation/roadmap.md` — S-04 and wallet integration question.
- `context/foundation/lessons.md` — migration consistency and CI execution rules.
- `context/foundation/test-plan.md` — independent arithmetic oracles and test-layer selection.
- `src/lib/services/positions.ts:126`, `src/lib/result.ts:25`, `src/lib/wallet.ts:35` — existing mutation/result/wallet patterns.
- `.claude/skills/verify/SKILL.md` — required implementation verification order.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Sale data and guarded writes

#### Automated

- [x] 1.1 Local migration and database tests prove pair/date/nonnegative constraints, existing-row compatibility and unchanged ownership isolation. — 2b6d95e
- [x] 1.2 Validation and service tests prove zero/precision/date boundaries, required acknowledgement, conditional writes and expected/unexpected error classification. — 2b6d95e
- [x] 1.3 Exact decimal read/write tests pass for sale fields across list, detail, confrontation and wallet services, including `npm run test:decimal-db`. — 2b6d95e

### Phase 2: Closing flow and final results

#### Automated

- [x] 2.1 Unit and SSR tests prove sale precedence, zero-price total loss and identical final percentage/date wiring across detail, list, wallet members and confrontation. — 4a8e459
- [x] 2.2 Wallet tests prove realised/open sums, missing-data counts and open-only freshness, including realised-only and empty cases. — 4a8e459
- [x] 2.3 Route/render tests prove action dispatch, preserved errors, required acknowledgement and absence of write forms on closed detail. — 4a8e459

#### Manual

- [x] 2.4 The closing form works with JavaScript disabled, errors remain readable, and the closed detail clearly shows the sale and final result at desktop and mobile widths. — 4a8e459

### Phase 3: Verification

#### Automated

- [x] 3.1 Local database and HTTP tests pass for competing closes, stale price updates, foreign/deleted/missing ids, reload persistence and delete/restore preservation. — a4d594f
- [x] 3.2 The repository verification sequence passes in order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`; `npm test`, `npm run test:decimal-db` and the local HTTP smoke walk also pass. — a4d594f

#### Manual

- [x] 3.3 A mixed open/closed wallet and the same-reason history show the agreed results and date labels; a mistaken repeat close never replaces the saved sale. — a4d594f
