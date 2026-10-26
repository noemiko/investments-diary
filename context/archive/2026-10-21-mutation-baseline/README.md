# Financial mutation checks

Scope: test-plan risk #1 and the financial contracts behind FR-003, FR-006 and
FR-013. No product behavior, schema, dependencies or deployment changes.

Run under the repository's Node 24 runtime:

```sh
npm run test:mutation
npm run test:mutation -- decimal pagination
npm run test:mutation -- position-reads wallet-reads
npx stryker run --mutate src/lib/result.ts
```

The script mutates each module independently and retains HTML/JSON evidence under
`reports/mutation/<module>/`. Supported keys: `result`, `decimal`, `parser`,
`wallet`, `format`, `transport`, `pagination`, `position-reads`, `wallet-reads`.
A direct Stryker invocation writes the default `reports/mutation/mutation.*`.
Read-service ranges deliberately exclude unrelated writes and CRUD helpers.

Stryker 10's Vitest runner with Vitest 5 produced populated `coveredBy` lists but
zero completed tests for 410 survivors in the original report. The command runner
bypasses that selection path, invokes the entire `npm test` suite for every
mutant, and uses the command's exit status. Its one synthetic “All tests” entry
is a suite invocation, not a count of individual Vitest cases. It cannot classify
`NoCoverage` or show per-test coverage, so evaluate survivors individually.

No build command is needed: Vitest compiles the source it executes. Production
build verification remains a separate gate. No score threshold or blanket mutant
exclusion is configured. Keep equivalent/intentional survivors in the report and
record their reasoning in `review.md` rather than weakening assertions or testing
private constants to inflate the score.
