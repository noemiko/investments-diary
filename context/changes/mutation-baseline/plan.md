# Trustworthy financial mutation testing

## Approved approach

Use the command runner (`npm test`, coverage off), HTML and JSON reports, and a
separate report for each module. Establish `result.ts` controls first, then rerun
decimal primitives/parser, wallet arithmetic, formatting, transport decoding,
pagination and financial read-service ranges. Retain all existing tests.

Only add tests for confirmed business-relevant survivors. Document equivalent
mutants and deliberately untested implementation/error-copy details; do not chase
100% or assert private batching constants. Finish with the repository's static
verification sequence and all unit/render tests. Preserve unrelated existing edits.

## Progress

- [x] Repair runner and prove all 24 result mutants, including the four controls, killed.
- [x] Run individual financial baselines and review surviving mutants.
- [x] Add justified tests and rerun affected scopes.
- [x] Record every remaining survivor's disposition and run final verification.
