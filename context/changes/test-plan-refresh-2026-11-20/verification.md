# Verification — past investment reasons

Date: 2026-11-20. Runtime: repository-pinned Node 24.21.0 via fnm, local Supabase.

## Local results

- `npm test`: 548 tests in 40 files passed.
- Static sequence: `npx astro sync`, `npm run lint`, `npx astro check`,
  `npm run build` passed. Astro check examined 184 files with no errors, warnings or hints.
- `npx playwright test --project=decision-history --repeat-each=2 --workers=1 --retries=0`:
  two consecutive passes, with shared E2E credentials empty.
- Focused discovery: one scenario, without auth setup. Existing Chromium discovery:
  23 tests including setup, unchanged from the pre-edit inventory.
- CI-equivalent invocation with `CI=1`, a fresh local server and empty shared E2E credentials:
  one pass. This checks the configured CI execution mode, not the GitHub runner itself.
- Workflow YAML parsing, seven shell blocks and inline Node syntax passed. Existing
  workflow triggers/jobs were preserved; the new job has a 20-minute timeout,
  focused command, seven-day artifacts and unconditional Supabase teardown.
- Targeted formatting and `git diff --check`: passed.

## Deliberate break

Temporarily replaced the form's `<ConfrontationPanel state={confrontation} />` with
`{null}`. The focused scenario failed at the panel's record-count assertion:
expected two entries, received zero. Source was restored byte-for-byte in `finally`,
and the subsequent CI-mode run passed. No production source diff remains.

Earlier attempts were inconclusive infrastructure failures: a Vite hydration reload,
then Astro's single-dev-server guard. The temporary server was stopped before the
successful isolated break run. Neither infrastructure failure is counted as evidence
that the test detected the intended regression.

## Scope and pending evidence

The scenario uses real local history and cookie authentication, independent literal
reasons/percentages/dates, A/B/empty selection, deleted exclusion, unchanged saved rows
and disposable-account cleanup. It does not search listings, download quotes or save
a new investment. No additional privacy tests were added, per the user's decision.

No schema, production logic, hosted settings, Vercel operations or branch-protection
changes were made. The larger browser/database suites were not rerun locally for this test-only
change; the remote database job subsequently passed as recorded below. The Manual Progress row remains unchecked pending the user’s confirmation.
Remote execution evidence is recorded separately below; it does not substitute for
human acceptance.

## Remote PR verification

PR: [#40](https://github.com/noemiko/investments-diary/pull/40)
Code commit: `0be31f083a0407d8a9c499f920cbf65f1e421508` (existing user commit).
Run: [CI 44743252626](https://github.com/noemiko/investments-diary/actions/runs/44743252626)

On 2026-11-20 the CI workflow completed successfully for that code commit:

- `ci`: passed, including unit tests, lint, Astro check and production build.
- `Decimal transport (local Supabase)`: passed, including service/transport, cron,
  recovery, account-creation and access/grant contracts.
- `Past investment reasons (local Supabase)`: passed; logs show one test using one
  worker, one pass in 33.3 seconds. Report upload and local Supabase teardown passed.
- `decision-history-report` artifact was uploaded with seven-day retention configured.
- HTTP smoke: skipped by the existing PR condition; this is not a new smoke pass.

The existing commit/PR also includes the user’s unrelated work. Its history was preserved;
no duplicate phase commits or replacement PR were created. This documentation follow-up
contains only verification evidence and progress references. Branch protection and hosted
state remain unverified. AI review is separate from this CI workflow.
