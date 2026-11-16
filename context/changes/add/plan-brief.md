# Position commissions — plan brief

> Full plan: `context/changes/add/plan.md`

## What & Why

Record actual opening and closing commissions so investment returns and wallet values reflect paid costs.

## Starting Point

Returns are gross. Live wallets and SQL snapshots calculate independently; quantity and quotes may be absent.

## Desired End State

Separate flat commission inputs feed consistent net returns. Paid opening fees reduce wallet value immediately, including before a quote arrives.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Fee model | Separate opening and closing amounts | Record different actual charges |
| Blank input | Zero | Keep fee-free entry simple |
| Currency | Wallet currency | No FX conversion |
| Return denominator | Purchase value plus opening fee | Reflect full invested cost |
| Quantity | Required for fees; complete missing quantity on close | Support net-return calculation and legacy entries |
| Existing positions | Zero fees; no correction UI | Keep scope focused |
| History | Preserve old snapshots | Retain recorded observations |

## Scope

In scope: persistence, net returns, wallet accounting, future snapshots, forms and detail display.
Out of scope: percentage fees, broker configuration, FX, partial closes, general editing and historical fee correction.

## Architecture / Approach

Extend existing decimal-text persistence and native POST forms. Use exact shared TypeScript arithmetic and matching SQL snapshot contributions; preserve valuation coverage independently from paid fees.

## Phases at a Glance

| Phase | Deliverable | Risk |
| --- | --- | --- |
| 1 | Persistence and contracts | View exposure and grants |
| 2 | Net calculations and snapshots | Precision and incomplete valuations |
| 3 | Forms and acceptance | Native POST preservation |

Prerequisites: Node 24, local Supabase/Docker, existing test environment.
Estimated effort: 2–3 development sessions.

## Open Risks & Assumptions

Legacy opening fees remain zero. Unpriced holdings remain incompletely valued even when known fees reduce wallet value.

## Success Criteria (Summary)

- Fees are recorded exactly and net returns agree across surfaces.
- Live and future snapshot totals agree, with accurate valuation coverage.
- Fee-free entries preserve behavior and historical snapshots remain unchanged.
