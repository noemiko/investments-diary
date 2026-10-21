# Financial mutation review — 2026-10-21

The original whole-repository report was unreliable: 410 of 534 survivors completed zero tests. The command runner executes the full Vitest suite and records one synthetic suite result per mutant. It does not expose per-test coverage or classify NoCoverage.

## Runner control

All 24 result mutants were killed before adding any tests and again in the final pass. The four requested controls (original IDs 767, 776, 779, 783: empty function, addition, percentage division, quantity division) were matched by source location and replacement, because IDs change with mutation scope.

## Final results

| Module         |  Killed | Survived | Timeout | Reports                                                                                                                        |
| -------------- | ------: | -------: | ------: | ------------------------------------------------------------------------------------------------------------------------------ |
| result         |      24 |        0 |       0 | [HTML](../../../reports/mutation/result/mutation.html), [JSON](../../../reports/mutation/result/mutation.json)                 |
| decimal        |      75 |        6 |       0 | [HTML](../../../reports/mutation/decimal/mutation.html), [JSON](../../../reports/mutation/decimal/mutation.json)               |
| parser         |      33 |        0 |       0 | [HTML](../../../reports/mutation/parser/mutation.html), [JSON](../../../reports/mutation/parser/mutation.json)                 |
| wallet         |      32 |        1 |       0 | [HTML](../../../reports/mutation/wallet/mutation.html), [JSON](../../../reports/mutation/wallet/mutation.json)                 |
| format         |      67 |        1 |       0 | [HTML](../../../reports/mutation/format/mutation.html), [JSON](../../../reports/mutation/format/mutation.json)                 |
| transport      |      11 |        0 |       0 | [HTML](../../../reports/mutation/transport/mutation.html), [JSON](../../../reports/mutation/transport/mutation.json)           |
| pagination     |      12 |        1 |       4 | [HTML](../../../reports/mutation/pagination/mutation.html), [JSON](../../../reports/mutation/pagination/mutation.json)         |
| position-reads |      45 |        1 |       0 | [HTML](../../../reports/mutation/position-reads/mutation.html), [JSON](../../../reports/mutation/position-reads/mutation.json) |
| wallet-reads   |      27 |        3 |       0 | [HTML](../../../reports/mutation/wallet-reads/mutation.html), [JSON](../../../reports/mutation/wallet-reads/mutation.json)     |
| **Total**      | **326** |   **13** |   **4** | **343 mutants**                                                                                                                |

## Every remaining survivor

No survivor remains classified as a missing behavioral test. These are explicit decisions, not blanket mutator exclusions. Diagnostic wording/type remains visible in the reports and can be tested later if it becomes an operational contract.

| Mutant            | Location                           | Replacement                   | Disposition                                                                                                                                                                            |
| ----------------- | ---------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| decimal #24       | `src/lib/decimal.ts:26`            | `""`                          | Intentionally untested detail: Changes only the decimal guard error text; invalid input still throws.                                                                                  |
| decimal #35       | `src/lib/decimal.ts:37`            | `denominator < 0n`            | Intentionally untested detail: Zero still throws through BigInt division by zero; only the error type/message changes. Negative denominators are tested separately.                    |
| decimal #38       | `src/lib/decimal.ts:37`            | `""`                          | Intentionally untested detail: Changes only the denominator guard error text.                                                                                                          |
| decimal #41       | `src/lib/decimal.ts:38`            | `numerator <= 0n`             | Equivalent behavior: At zero, negating a BigInt leaves the same zero magnitude.                                                                                                        |
| decimal #55       | `src/lib/decimal.ts:41`            | `numerator <= 0n`             | Equivalent behavior: BigInt has no distinct negative zero; both branches return 0n.                                                                                                    |
| decimal #84       | `src/lib/decimal.ts:50`            | `""`                          | Intentionally untested detail: Changes only the positive-decimal guard error text; zero is still rejected.                                                                             |
| wallet #16        | `src/lib/wallet.ts:46`             | `result.priceDate <= asOf`    | Equivalent behavior: Assigning the same date again on equality leaves the oldest counted date unchanged.                                                                               |
| format #19        | `src/lib/format.ts:12`             | `rounded <= 0n`               | Equivalent behavior: Negating rounded 0n leaves the same magnitude and displayed zero.                                                                                                 |
| pagination #4     | `src/lib/services/read-all.ts:11`  | `rows.length + PAGE_SIZE + 1` | Intentionally untested detail: Requests two extra rows per batch. Advancing by received rows still returns all rows in order, without duplication; the batch-size constant is private. |
| position-reads #1 | `src/lib/services/positions.ts:66` | `""`                          | Intentionally untested detail: Drops only the operation label from the error context; rejection and upstream cause are preserved.                                                      |
| wallet-reads #5   | `src/lib/services/wallets.ts:34`   | `{}`                          | Equivalent behavior: PostgREST defaults ascending to true, so the serialized name order remains name.asc.                                                                              |
| wallet-reads #24  | `src/lib/services/wallets.ts:56`   | `""`                          | Intentionally untested detail: Drops only the operation label from the error context; rejection and upstream cause are preserved.                                                      |
| wallet-reads #30  | `src/lib/services/wallets.ts:61`   | `{}`                          | Equivalent behavior: PostgREST defaults ascending to true, so the serialized id order remains id.asc.                                                                                  |

## Timeout detections

The following pagination mutations make an empty loop, remove termination on empty pages, reverse the empty-page condition, or prevent offset advancement by removing the row append. Their nontermination is detected by the runner timeout. They are not counted as assertion kills or harmless survivors.

- `src/lib/services/read-all.ts:10`, mutant #3: `{}`.
- `src/lib/services/read-all.ts:14`, mutant #16: `false`.
- `src/lib/services/read-all.ts:14`, mutant #17: `data.length !== 0`.
- `src/lib/services/read-all.ts:15`, mutant #18: `;`.

## Tests added and baseline evidence

- Decimal units: reject surrounding whitespace, excessive whole digits and excessive fractional precision; reject a negative ratio denominator; accept database zero by default and reject it under explicit positivity.
- Formatting: reject exponent text instead of rendering an invalid numeric value.
- Pagination: reject missing data after a short successful page, verify advancement by received rows and consistent inclusive ranges without pinning the private batch size. Existing tests retain later-page failure and 1200/2400-row coverage.
- Read services: verify projections, active-record filters, sort order, optional wallet filter, record identity, joined names, exact decimals, unavailable details and preserved upstream failures. Network transport alone is replaced; the real query builder executes. Fixture retries are disabled to avoid backoff obscuring assertion failures.
- Existing result, parser, wallet and transport expectations were sufficient for their meaningful mutations; no duplicate tests were added for them.

Initial command-runner JSON snapshots are retained under `reports/mutation/baseline/`. The initial wallet read range accidentally included createWallet; the final range is corrected to lines 29–66. No CRUD tests were added or required, and no production source was changed.

## Verification

- Node 24.21.0 for mutation runs and final static checks.
- `npm test -- --reporter=dot`: 12 files, 151 tests passed (134 original plus 17 added).
- `npx astro sync`: passed.
- `npm run lint`: passed.
- `npx astro check`: passed; 88 files, zero errors, warnings or hints.
- `npm run build`: passed.
- `npm run test:mutation`: all nine individual scopes completed, with the final results above.
- The local database transport suite was not needed: production parsing, DTOs, arithmetic, projections and writes were unchanged. These mocked transport tests do not establish RLS behavior.
- Existing unrelated edits were preserved; no staging, commit or deployment was performed.
