# Named Wallets — Plan Brief

> Full plan: [plan.md](plan.md)

## What & Why

Named wallets group investments and summarize their results. Membership, excluded counts and price dates explain each total.

## Starting Point

Most functionality exists as uncommitted work. Complete membership views, strengthen database restrictions and close verification gaps.

## Desired End State

Create and edit wallets, assign new investments, inspect members and dated totals. Existing investments remain in Main with editable starting value 0.

## Key Decisions Made

| Decision             | Choice                                       | Why                                         |
| -------------------- | -------------------------------------------- | ------------------------------------------- |
| Existing work        | Preserve and finish                          | Avoid rebuilding                            |
| Existing investments | Main at 0                                    | Preserve entries without inventing balances |
| Closing              | Defer to S-04                                | Not yet supported                           |
| Reassignment         | Defer to S-07                                | Separate editing scope                      |
| Membership           | Labels and member list                       | Explain totals                              |
| Rules                | Unique names, nonnegative start, no deletion | Durable assignment                          |

## Scope

Included: creation/editing, assignment, membership, transparent totals, migration and privacy tests.
Excluded: closing, moves, deletion, live prices, currencies and broker accounts.

## Architecture / Approach

Reuse server-rendered forms, request-scoped clients and the shared calculation. Database constraints enforce ownership and prevent deletion; totals remain computed.

## Phases at a Glance

| Phase | Delivery           | Risk                           |
| ----- | ------------------ | ------------------------------ |
| 1     | Data and backfill  | Existing data and history      |
| 2     | Visible grouping   | Membership/total consistency   |
| 3     | Integration and CI | Persistence and ownership gaps |

Prerequisites: preserve working-tree changes; disposable database available.
Estimated effort: three phases; no calendar estimate.

## Open Risks & Assumptions

Inspect applied migrations. S-04 must extend totals for closed positions. Real wallet data requires forward repairs.

## Success Criteria (Summary)

- One owned wallet per investment and visible membership.
- Totals explain exclusions and freshness.
- Migration, integration, privacy and UI checks pass.

## References

FR-013; roadmap S-09; detailed plan.
