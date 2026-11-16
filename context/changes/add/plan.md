# Position commissions — implementation plan

## Overview

Add separate flat opening and closing commissions in the wallet currency. Blank inputs mean zero. The approved separate amounts supersede the original single-value idea.

## Current State Analysis

Position results are gross; wallet totals reuse TypeScript results but snapshots calculate independently in SQL. Quantity is optional and unpriced holdings have incomplete valuation. Existing views freeze their star projections, so new columns require explicit exposure.

## Desired End State

Open profit = (price − buy price) × quantity − opening commission.
Closed profit = (sale price − buy price) × quantity − opening commission − closing commission.
Net return = profit / (buy price × quantity + opening commission) × 100.

Buy 10 shares at 100 with a 5 opening fee, then sell at 110 with a 7 closing fee: profit 88; return 88 / 1,005 × 100 ≈ 8.76%.

Nonzero fees require positive quantity. Existing missing quantity can be completed atomically on close. Fee-free missing-quantity entries retain percentage-only results. Paid opening fees reduce wallet value before a quote arrives without making valuation complete. Old snapshots remain unchanged.

## What We're NOT Doing

Percentage fees, FX, broker configuration, partial closes, estimated closing fees, general editing, or historical fee backfill UI. Existing fees default to zero.

## Implementation Approach

Reuse decimal strings, BigInt arithmetic, native POST forms, and shared result calculations. Mirror approved wallet contribution formulas in SQL snapshots. Preserve effective-price selection, view column order and security-invoker semantics, and ownership checks. Scale fee units from 8 to 16 decimal places before subtracting from products.

## Phase 1: Persistence and contracts

### Changes Required

**Area:** Schema, types, services and requirements

**Intent:** Persistence and contracts for consistent commission accounting.

**Contract:** Add nonnegative numeric(20,8) opening_commission and closing_commission, not-null/default zero; require quantity for nonzero fees and zero closing fee while open. Extend generated types, decimal-write types, strict decoders and every read projection as text. Append view fields explicitly and grant appropriate column updates. Extend create and atomic close writes; only complete a missing quantity, never replace one. Preserve active/open/owner filters and sale atomicity. Amend relevant PRD requirements and fee exclusion.

### Success Criteria

#### Automated Verification

- Local migration replay and contract tests pass, including zero backfill, constraints, ownership, view exposure, and grants.
- Decimal transport and service tests pass for commission reads, creation, atomic closing, and competing closes.

## Phase 2: Net returns and wallet accounting

### Changes Required

**Area:** Result and wallet calculations

**Intent:** Net returns and wallet accounting for consistent commission accounting.

**Contract:** Extend src/lib/result.ts with exact net profit and total-cost return. Retain formatting/date/direction contracts. Fee-free entries without quantity keep the existing percentage but no monetary result. Unpriced opening fees contribute to openChange while valuation counts, sources and freshness retain their meaning. Mirror calculations in snapshot SQL; count valued holdings independently of fee-only costs. Preserve historical rows and capture idempotency.

### Success Criteria

#### Automated Verification

- Result and wallet tests pass for open/closed fees, exact precision, missing quotes, missing quantity, and a gross gain becoming a net loss.
- Local database tests prove future snapshot totals match TypeScript totals, coverage remains accurate, and existing observations remain unchanged.

## Phase 3: Forms, display, and acceptance

### Changes Required

**Area:** Creation, closing and display

**Intent:** Forms, display, and acceptance for consistent commission accounting.

**Contract:** Add opening commission on creation and closing commission on sale, each labelled with wallet currency and explained as a total fee. Blank is zero; reject invalid/negative/overflow/excess-precision input. Require quantity for nonzero fees; expose missing quantity on close. Preserve raw values/errors through failed POST and listing round trips with and without JavaScript. Show fees in detail and pass both through all result surfaces; explain net-return meaning. Add focused tests.

### Success Criteria

#### Automated Verification

- Form and rendered-surface tests pass for commission inputs, preserved submissions, legacy quantity completion, and consistent net results.
- `npm test` passes.
- The repository verification sequence passes in order: Astro sync, lint, Astro check, build.
- Local decimal, contract, and recovery database suites pass.

#### Manual Verification

- Creation and closing work with JavaScript enabled and disabled, including a legacy position receiving quantity during closing.
- Commission labels, errors, detail values, net percentages, wallet totals, and incomplete-valuation notices are clear and consistent.

## Testing Strategy

Test blank/zero and different fees; fractional quantities and eight-decimal precision; unchanged prices and gross gains becoming net losses; zero-price sales; unpriced costs and first-quote no-double-deduction; quantity requirements/completion; failed/competing closes; owner isolation; deletion/restoration; snapshot parity, coverage, and immutable history. Use existing unit, service, Astro rendering, and local database harnesses.

## Performance Considerations

Retain linear aggregation over existing reads with no per-position network calls.

## Migration Notes

Apply the additive migration before code selecting new columns. Use local Supabase only; do not reset diary data or modify cloud deployments. Default old fees to zero and preserve snapshots.

## References

- Application src/lib/result.ts:27; src/lib/wallet.ts; position services, validators and result-surface tests.
- Effective-price view migrations and wallet-snapshot capture SQL.
- Application .claude/skills/verify/SKILL.md and context/foundation/lessons.md.

## Progress

### Phase 1: Persistence and contracts

#### Automated

- [x] 1.1 Local migration replay and contract tests pass, including zero backfill, constraints, ownership, view exposure, and grants.
- [x] 1.2 Decimal transport and service tests pass for commission reads, creation, atomic closing, and competing closes.

### Phase 2: Net returns and wallet accounting

#### Automated

- [x] 2.1 Result and wallet tests pass for open/closed fees, exact precision, missing quotes, missing quantity, and a gross gain becoming a net loss.
- [x] 2.2 Local database tests prove future snapshot totals match TypeScript totals, coverage remains accurate, and existing observations remain unchanged.

### Phase 3: Forms, display, and acceptance

#### Automated

- [x] 3.1 Form and rendered-surface tests pass for commission inputs, preserved submissions, legacy quantity completion, and consistent net results.
- [x] 3.2 `npm test` passes.
- [x] 3.3 The repository verification sequence passes in order: Astro sync, lint, Astro check, build.
- [x] 3.4 Local decimal, contract, and recovery database suites pass.

#### Manual

- [x] 3.5 Creation and closing work with JavaScript enabled and disabled, including a legacy position receiving quantity during closing.
- [x] 3.6 Commission labels, errors, detail values, net percentages, wallet totals, and incomplete-valuation notices are clear and consistent.
