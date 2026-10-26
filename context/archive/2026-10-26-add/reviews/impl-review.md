<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Add Sentry

- **Plan**: context/changes/add/plan.md
- **Scope**: Full plan — implemented code; manual acceptance remains pending
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-26
- **Verdict**: APPROVED — reviewed code after F1/F2 fixes; manual acceptance pending
- **Findings**: 0 critical, 2 warnings fixed, 0 observations; 0 unresolved
- **Base**: 273fc74b861ac4e96b2fcccc23e380dc58124dda
- **Working tree**: uncommitted implementation, including untracked SDK modules/tests/docs

User explicitly approved reviewing phases 1–3 despite their unchecked manual
criteria. Progress remains 6/9; this review does not confirm deployment readiness
or complete any manual criterion.

## Verdicts

| Dimension           | Verdict                                                     |
| ------------------- | ----------------------------------------------------------- |
| Plan Adherence      | PASS — F2 fixed                                             |
| Scope Discipline    | PASS                                                        |
| Safety & Quality    | PASS — F1 fixed                                             |
| Architecture        | PASS                                                        |
| Pattern Consistency | PASS                                                        |
| Success Criteria    | PASS — prescribed automated commands; manual checks pending |

## Findings

### F1 — Release lookup uses the caller's directory and blocks Astro --root

- **Severity**: ⚠️ WARNING
- **Priority**: P2
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs:15–16
- **Detail**: The new unconditional `git rev-parse HEAD` fallback runs in
  `process.cwd()`, rather than the project containing the configuration. From
  this workspace's parent `xdev10` directory, the supported command
  `node investments-diary/node_modules/astro/bin/astro.mjs sync --root investments-diary`
  now fails while loading the configuration with `fatal: not a git repository`.
  `build --root` and `dev --root` load the same configuration. The parent is not
  a Git repository although the selected application is. An exported source
  tree without `.git` and without `VERCEL_GIT_COMMIT_SHA` also fails. Monitoring
  metadata should not prevent otherwise valid application startup/builds.
- **Fix**: Resolve Git metadata relative to `import.meta.dirname`, handle missing
  Git metadata without throwing, and add a config-load regression test from a
  non-repository parent directory. Keep configured release precedence intact.
- **Decision**: FIXED — user approved on 2026-10-26. Git lookup now uses the
  configuration directory, falls back to `local-unknown` if Git is unavailable,
  and preserves `VERCEL_GIT_COMMIT_SHA` precedence. Three subprocess config-load
  regression tests cover these cases; verification details are below.

### F2 — Ordinary auth input validation produces unexpected-error incidents

- **Severity**: ⚠️ WARNING
- **Priority**: P2
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/observability/auth.ts:36–39
- **Detail**: The plan excludes expected validation failures from incident
  reporting, but `email_address_invalid` and `validation_failed` are absent
  from `EXPECTED_CODES`. The installed Supabase SDK declares both codes in
  `node_modules/@supabase/auth-js/src/lib/error-codes.ts:8,94`. Executing the
  actual classifier with `new AuthApiError("fixture", 422, code)` returns
  `true` for both. The signup handler calls `reportAuthError` for every returned
  error (`src/pages/api/auth/signup.ts:18`), and server-side input is forwarded
  directly to Supabase. The form has `noValidate`, so a normal submission
  without JavaScript can reach provider validation. A mistyped address can
  therefore produce an error issue/alert even while the intended validation
  response is shown. Current tests enumerate expected codes but omit these
  routine validation cases.
- **Fix**: Classify the documented routine email/input validation codes as
  expected for 4xx responses and add classifier/handler regression tests.
  Retain the existing priority of retry/network/5xx failures and reporting of
  genuinely unknown codes.
- **Decision**: FIXED — user approved on 2026-10-26. Added
  `email_address_invalid` and `validation_failed` to expected auth codes.
  Classifier tests prove 422 is quiet and 503 with the same code is reported;
  signup-handler tests preserve the existing 302 validation redirect without
  reporting an incident. Retry/network and unknown-code coverage still passes.

## Plan comparison

| Planned group                                          | Result | Evidence                                                                                                                                           |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact SDK, optional DSN, server/browser initialization | MATCH  | SDK 11.8.0 pinned; separate root init files; middleware imports server initialization                                                              |
| Error-only telemetry and final privacy boundary        | MATCH  | Shared rebuilt event allowlist; request/user/extra/breadcrumb/message stripping; safe source frames/debug IDs; local receiver saw only error items |
| Release/environment and private source maps            | DRIFT  | Normal configured build works, but release fallback introduces F1; real upload still awaits human configuration                                    |
| Nine read fallback boundaries                          | MATCH  | Reporting added only at catch boundaries; real-page tests preserve responses and entered form data                                                 |
| Read causes and shared write reporting                 | MATCH  | Read service errors retain causes; write outcomes report at their owning service boundary; expected domain outcomes remain quiet                   |
| Auth classification and result inspection              | DRIFT  | Result inspection wired throughout; expected-code coverage is incomplete, F2                                                                       |
| Request isolation                                      | MATCH  | Async isolation scope and request ID; concurrency test; automatic outer-boundary events may omit custom inner ID, already documented               |
| Local harness, build checks and activation guide       | MATCH  | Isolated native-route probes, real SDK envelopes, automatic Chromium exception, transport refusal and Vercel setup instructions                    |
| Scope exclusions                                       | MATCH  | No database/financial behavior changes, new public probe routes, replay/tracing/log collection or deployment changes                               |

Existing tests were adapted to inspect preserved causes rather than raw provider
messages. This is consistent with the intended diagnostic/privacy contract.
The pre-existing untracked observability audit is supporting context, not an
extra application change.

## Verification rerun

All commands below used the pinned Node 24.21.0 runtime. No application source
was modified during review.

| Check                                                                        | Result / actual output                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `npx astro sync`                                                             | PASS — generated types                                   |
| `npm run lint`                                                               | PASS — exit 0                                            |
| `npm test`                                                                   | PASS — 19 files, 217 tests                               |
| `npx astro check`                                                            | PASS — 112 files; 0 errors, warnings, hints              |
| `npm run build` from project root                                            | PASS — Vercel server output, build complete              |
| `npm run check:sentry-build`                                                 | PASS — 14 public files, no maps or configured credential |
| `node scripts/sentry-probe.mjs`                                              | PASS — all six scenarios                                 |
| `BASE_URL=http://127.0.0.1:4321 npm run smoke`                               | PASS — All smoke steps passed, local Supabase only       |
| `git diff --check`                                                           | PASS                                                     |
| Additional: `astro sync --root investments-diary` from workspace parent      | FAIL — configuration load; F1                            |
| Additional: classifier against SDK `AuthApiError` with two routine 422 codes | Both returned unexpected=true; F2                        |

Review probe evidence is retained at:
`/var/folders/2n/qsxhjgcs3ygd3mbjx48w0dph0000gn/T/diary-sentry-nP1hjT/`
(`events.json`, `results.json`, `astro.log`, isolated app). One event was received
for each caught read, failed write, auth 503, uncaught server exception and browser
exception. Refused telemetry preserved the existing 302 response. The local
Astro server used for smoke was stopped afterwards.

## Manual acceptance and limits

- Plan 1.3, sample-event human review: pending, not falsely checked complete.
- Plan 2.3, human form/fallback review: pending, not falsely checked complete.
- Plan 3.3, hosted cold API/browser delivery, source-map resolution and actual
  alert email: pending; not inferred from local delivery or static debug-ID tests.
- Both requested parallel reviewer agents failed because of account usage
  limits. Their work is **not** counted as completed independent reviews; the
  primary agent performed both dimensions directly.
- Vercel CLI deployments can include Git metadata; F1 does not claim that every
  Vercel CLI deployment fails. Its reproducible trigger is the local `--root`
  invocation or missing Git metadata.
- Initial review changed only reports and change metadata. Subsequent approved
  F1/F2 triage changed configuration, auth classification and regression tests. Nothing has
  been staged, committed, pushed or deployed.

## Triage verification — F1 (2026-10-26)

- Before the fix, the new parent-directory and missing-Git tests both failed;
  after the fix all three config-load tests passed.
- Temporarily removing Vercel release precedence made its regression test fail;
  the original configuration was restored unconditionally with `finally`.
- The originally failing real `astro sync --root investments-diary` invocation
  from the workspace parent now passes.
- Required sequence passed: `astro sync`, `npm run lint`, `astro check`
  (113 files, zero diagnostics), `npm run build`.
- Full Vitest passed: 20 files, 220 tests. Public build inspection passed:
  14 files, no source maps or configured credential.
- F2 remains pending. All three manual acceptance criteria remain pending.

## Triage verification — F2 (2026-10-26)

- Four new regression tests failed before the fix (two classifier cases and
  two signup-handler cases), then passed after adding the two expected codes.
- Full Vitest passed: 20 files, 224 tests, including existing retry/network and
  unknown-code reporting assertions.
- Required sequence passed: `astro sync`, `npm run lint`, `astro check`
  (113 files, zero diagnostics), `npm run build`.
- Public build inspection passed: 14 files, no source maps or configured
  credential. The HTTP smoke walk against local Supabase passed all steps.
- Both findings are now FIXED. All three manual acceptance criteria remain
  pending, including real Vercel delivery, source maps and email alert.
