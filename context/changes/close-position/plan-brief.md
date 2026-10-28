# Close position — Plan Brief

> Full plan: [plan.md](plan.md)

## What & Why

Record the end of an investment with its sell price and date, so the diary connects the original reasoning to the final outcome. This delivers FR-007 / roadmap S-04 and resolves how realised results count in wallets under FR-013.

## Starting Point

The diary already supports current-price updates, exact-decimal results, wallet totals and same-reason history. It has no sale state, and every result currently uses the latest manual quote. Position results are deliberately percentage-only.

## Desired End State

The author closes an open position from its detail page. After saving, the final percentage and sale date appear in detail, position lists, wallet members and same-reason history; the detail shows the sale facts and no longer offers price updates. Closing keeps accumulated gains/losses in wallet value.

## Key Decisions Made

| Decision         | Choice                                                 | Why                                                                            |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Sale scope       | Entire position only                                   | Matches FR-007 without introducing transaction history.                        |
| Sell price       | Zero or positive, exact decimal                        | A worthless investment must support a -100.00% final result.                   |
| Corrections      | Defer corrections and reopening to S-07                | Keeps this change focused; the form explains the limitation.                   |
| Wallet total     | Starting value + realised + unrealised amounts         | Closing should preserve accumulated performance.                               |
| Sale date        | Buy date through UTC today, regardless of later quotes | Supports recording the actual past sale.                                       |
| Confirmation     | Required acknowledgement checkbox                      | Makes a currently uncorrectable close deliberate and works without JavaScript. |
| Wallet freshness | Oldest counted open quote only                         | An old sale must not make current holdings appear stale.                       |
| Result display   | Retain percentage-only; mark final and show sale date  | Preserves the earlier display decision and distinguishes closed outcomes.      |

## Scope

**In scope:** sale storage/validation, guarded close and price writes, native close form, final results everywhere, wallet integration, persistence/ownership/concurrency verification.

**Out of scope:** partial exits, sale corrections/reopening, fees, currencies, proceeds/cash accounting, price history and broader factual editing.

## Architecture / Approach

Add nullable sale-price/date columns; a complete pair means closed. Use one conditional update so the first close wins. Preserve the stored quote but calculate closed results from sale facts. Extend the existing exact-decimal DTOs, shared result helper and renderers; no new dependencies. Closed positions stay in the diary and can still be deleted/restored.

## Phases at a Glance

| Phase                             | What it delivers                                              | Key risk                                      |
| --------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| 1. Sale data and guarded writes   | Schema, exact decimal transport, validation and close service | Concurrent submissions or decimal loss        |
| 2. Closing flow and final results | Form, closed detail, final results and agreed wallet rules    | A view still using the old quote              |
| 3. Verification                   | Local database/HTTP acceptance and repository checks          | Ownership, persistence or restore regressions |

**Prerequisites:** local Supabase/Docker, Node 24 and the existing price, wallet and confrontation features.

**Estimated effort:** roughly 2–3 focused implementation sessions across three phases; a sizing estimate, not a deadline commitment.

## Open Risks & Assumptions

- A mistaken close cannot yet be corrected in the UI; acknowledgement is required and S-07 owns corrections.
- The migration must precede deployment of readers selecting sale fields. Preserve recorded sales during rollback and prefer a forward fix.
- UTC today remains the existing server date convention. No sale needs a current quote or a known quantity.
- Wallet values track performance, not cash proceeds. Missing quantity excludes an amount but never the final percentage.

## Success Criteria (Summary)

- Closing persists across reloads and every result surface shows the final percentage and sale date.
- A wallet starting at 1,000 with realised gain 100 and open gain 40 shows 1,140; its freshness uses the open quote. Realised-only totals say so explicitly.
- Zero-price closure works; competing closes cannot overwrite the first sale; foreign accounts and stale forms cannot mutate the closed position; deletion/restoration preserves sale facts.

## References

- `context/foundation/prd.md` — FR-007, FR-013 and privacy/data-loss guardrails.
- `context/foundation/roadmap.md` — S-04.
- `context/foundation/test-plan.md` — arithmetic, ownership and migration risks.
- `plan.md` — implementation contracts, checks and canonical Progress.
