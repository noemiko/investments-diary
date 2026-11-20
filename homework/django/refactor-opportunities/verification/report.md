# C1 implementation verification

Date: 2026-11-06
Source commit: `b501b8493f31cf8cba31211d59b3b78642b8cb02`, with the existing staged bulk-update changes preserved.

## Result

Expression readback now uses fields already selected for writing. The UPDATE loop no longer rechecks only `field.name` against `update_fields`. Both supported FK spellings follow the same native-returning or deferred-readback policy. No compiler/queryset protocol, signal argument, INSERT path, or migration was changed.

Two new tests share a regression helper and exercise `profile` and `profile_id` with fresh employees, existing target profiles, independently verified stored values, an excluded expression, and both save signals. Receivers are sender-scoped and registered for cleanup. First attribute access requires zero queries with native returning and one query with returning disabled. The fallback tests assert public deferred-field state before access.

## Verification matrix

| Stage | SQLite 3.54.1 | PostgreSQL 16.15 |
|---|---|---|
| Existing selected suites before test additions | PASS: 334 tests, 2 skipped, 1 expected failure | PASS: 334 tests, 22 skipped |
| New tests against unchanged production code | Expected FAIL: 2 tests, 2 failing `profile_id` subtests | Expected FAIL: 2 tests, 2 failing `profile_id` subtests |
| New tests after fix | PASS: 2 tests, no skips | PASS: 2 tests, no skips |
| Final selected suites | PASS: 336 tests, 2 skipped, 1 expected failure | PASS: 336 tests, 22 skipped |

Both field-name controls passed before the fix. In native mode, the attribute-name case retained a `CombinedExpression` instead of the stored key. In forced fallback it failed to mark `profile_id` as deferred. Independent stored-value, excluded-expression, and signal assertions precede the failing assertions. After the fix, all four spelling/capability scenarios pass on both backends.

Skips and expected failures are unchanged from baseline:

- SQLite skips the Oracle-only negative-XOR test and the Python 3.14+ deferred-annotations test. `FTimeDeltaTests.test_mixed_comparisons1` is an expected SQLite failure.
- PostgreSQL additionally skips 19 unsupported virtual-generated-column tests and one defensive test applicable only to databases that do not validate parameter types; it has no expected failures.
- Neither C1 regression test was skipped.

Full commands, test names, outcomes, and skips are retained in the adjacent `baseline-*`, `red-*`, `green-*`, and `final-*` logs.

## Commands and correction to the plan

Broad baseline and final verification:

```sh
python tests/runtests.py update_only_fields expressions model_fields.test_generatedfield defer --parallel=1 --verbosity=2
```

Focused red/green verification:

```sh
python tests/runtests.py \
  update_only_fields.tests.UpdateOnlyFieldsTests.test_update_fields_fk_expression \
  update_only_fields.tests.UpdateOnlyFieldsTests.test_update_fields_fk_expression_no_returning \
  --parallel=1 --verbosity=2
```

Each command also ran with `--settings=refactor_opportunities_postgres`, with the temporary settings directory and repository test directory on `PYTHONPATH` and task-specific connection environment variables set.

The approved focused command omitted `.tests` in its dotted labels. The initial invocations produced import errors, not bug evidence. The plan and executed command were corrected; those initial logs remain separately named `command-label-error-*`. Valid red evidence is in `red-*`.

## Runtime, style, and isolation

- Isolated Python 3.12.13 environment; checkout installed editable.
- SQLite 3.54.1; psycopg 3.3.8; complete package versions in [dependencies.txt](dependencies.txt).
- Disposable `postgres:16` container `django-c1-38a6bce8`, PostgreSQL 16.15, localhost-only dynamically allocated port 50976, separate application database names `c1_default` and `c1_other`, and a task-owned role with test-database creation privileges.
- Credentials existed only in permission-0600 task-owned temporary files outside the repository. They are not included in the evidence.
- Black 26.5.1, isort 8.0.1, Flake8 7.3.0, and `git diff --check` passed. No formatting rewrite was needed. See [lint.txt](lint.txt).
- Compared 7,278 pre-existing tracked/untracked file fingerprints. Only the production file, regression test file, and this change’s metadata changed. The original Git index patch remained byte-identical. The research report, sibling work, and all other pre-existing files remained unchanged. See [preservation.txt](preservation.txt).
- Removed this task’s container and anonymous volume, verified its absence, and removed the temporary environment, settings, test wrapper, and credentials. Other containers were preserved. See [cleanup.txt](cleanup.txt).

## Limits and review state

SQLite and PostgreSQL exercised their native returning implementations. Disabling the feature additionally exercised Django’s fallback branch; this is not native MySQL/MariaDB driver validation. No full Django suite or new combined async/fetch-mode coverage was run.

Automated Progress items 1.1, 1.2, and 2.1–2.3 are complete. Human diff review (2.4) remains pending; it has not been marked complete by the agent. The change remains `implementing` while that manual criterion is pending. No commit or staging was performed.

Implementation, regression tests, and automated verification were performed with Codex. The accepted plan and brief are saved beside the research. The only execution correction to the plan was the missing `.tests` module component in focused commands.
