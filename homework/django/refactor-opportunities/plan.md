# C1: Consistent expression readback for partial saves

## Overview

Fix the inconsistency between `save(update_fields={"profile"})` and `save(update_fields={"profile_id"})` when the foreign-key attribute contains a database expression.

This is a local exercise. The accepted scope is C1 only, with SQLite and PostgreSQL verification. No public API, signature, database schema, or migration changes are required.

## Current State Analysis

Django already selects concrete fields using either their model name or attribute name. Expression readback then checks the original spelling again, accepting only the model name. Consequently, two supported names can write the same database field but leave different Python instance values.

The expected behavior is already documented: retrieve resolved expressions with the write when the backend supports returning; otherwise defer retrieval until attribute access. The fix must preserve that query policy.

Planning used the verified research and source inspection. No runtime tests were executed. Existing staged bulk-update changes must remain intact.

## Desired End State

Both spellings produce the same stored foreign key and follow the same readback policy:

| Situation | Expected behavior |
|---|---|
| Native UPDATE returning | First attribute access returns the resolved key without another query. |
| Returning disabled | The field is deferred; first access retrieves its value with one query. |
| Expression field excluded from `update_fields` | Its database value and instance expression remain unchanged. |
| Save signals | Both receive the caller’s original field spelling. |

### Key Discoveries

- `django/db/models/base.py:1100`: field selection and expression readback already operate on selected `Field` objects; the second spelling check is redundant.
- `tests/update_only_fields/tests.py:313`: existing partial-save tests establish expression exclusion and capability-dependent readback.
- Existing `Employee` and `Profile` models support the regression without new models.
- C2 already names result truthiness as `updated`; its proposed structural benefit remains insufficient for this change.

## What We’re NOT Doing

Defer C2–C4, exception-assertion cleanup, and the `_state.adding` comment correction. Do not normalize signal payloads, introduce a result abstraction, change compiler/queryset protocols, or require eager refresh queries.

New combined tests for post-save `FETCH_PEERS`, `FETCH_RAISE`, exceptional async saves, and inherited rollback remain outside scope. Existing deferred-loading tests will run as regression coverage.

No upstream submission, release note, browser testing, performance improvement claim, or native MySQL/MariaDB validation is included.

## Implementation Approach

First establish baseline behavior and capture a failing regression. Then make the local readback decision depend on the fields already selected for writing.

Keep regression tests backend-portable: exercise each backend’s native capability and separately disable returning. Never force returning support onto a backend.

## Phase 1: Capture the alias-readback regression

### Changes Required

**Files:** task-owned temporary test environment and PostgreSQL settings outside the repository.

**Intent:** establish reproducible SQLite and PostgreSQL verification without disturbing the sibling exercise.

**Contract:** use an isolated Python 3.12 virtual environment with this checkout, the PostgreSQL test requirements, and Pillow for model-field checks. Start a disposable `postgres:16` container with a unique task-owned name, ephemeral storage, and an automatically allocated port bound to `127.0.0.1`. Generate local credentials outside tracked files. Configure separate `default` and `other` database names through a temporary `refactor_opportunities_postgres` settings module, with a role permitted to create test databases. Wait for database readiness before testing.

Do not reuse or remove another change’s container. Preserve existing staged and untracked work.

**File:** `tests/update_only_fields/tests.py`

**Intent:** demonstrate the supported-alias inconsistency and protect the surrounding observable contracts.

**Contract:**

- Add `test_update_fields_fk_expression` and `test_update_fields_fk_expression_no_returning`.
- Each test exercises `profile` and `profile_id` using a fresh employee for each spelling.
- Create two real profiles. Assign `F("profile_id") + (target.pk - original.pk)` so the expression targets an existing row without assuming consecutive keys.
- Read the stored key independently before accessing the employee attribute.
- In native mode, assert first access returns the target key with zero queries when returning is supported, otherwise one.
- In forced fallback, temporarily set `can_return_rows_from_update=False`; verify `profile_id` is deferred before access and resolves with one query.
- Include an unselected `employee_num` expression; verify it remains the same expression on the instance and its stored value is unchanged.
- Capture `pre_save` and `post_save` for `Employee`, with reliable receiver cleanup. Assert exactly one notification per signal and the original spelling as a frozenset.

Run the tests against unchanged production code. Record the `profile` controls succeeding and the `profile_id` cases failing because readback is missing. Do not accept setup failures as regression evidence.

### Success Criteria

#### Automated Verification

- Existing selected suites pass on SQLite and PostgreSQL before test additions; expected failures and backend skips are recorded.
- New tests demonstrate the alias-specific failure in native and forced-fallback modes on both backends, with successful field-name controls.

Phase 1 intentionally ends with failing regression tests in the working tree. Do not commit that incomplete state independently.

## Phase 2: Reuse selected fields for expression readback

### Changes Required

**File:** `django/db/models/base.py`

**Intent:** make writing and expression readback use the same selected fields.

**Contract:** remove the name-only `update_fields` predicate from the UPDATE expression-readback loop. Retain expression detection and append the already-selected field to `returning_fields`. Preserve field selection, generated-field handling, signal arguments, INSERT handling, and deferred assignment behavior.

**Files:** the regression tests and change-local verification evidence.

**Intent:** establish the corrected behavior and review the final change independently of unrelated work.

**Contract:** rerun the new tests and selected suites on both backends. Record interpreter/database versions, commands, outcomes, skips, and the distinction between native returning and forced fallback. Remove only this change’s temporary resources after verification, including on an aborted run.

### Success Criteria

#### Automated Verification

- New regression tests pass on SQLite and PostgreSQL in native and forced-fallback modes.
- Selected partial-save, expression, generated-field, and deferred-loading suites pass on both backends, with expected failures and skips recorded.
- Configured Black, isort, and Flake8 checks pass for the two changed Python files; `git diff --check` passes and task-owned temporary resources are removed.

#### Manual Verification

- Human diff review confirms the single selected-field decision, original signal spellings, unchanged refresh policy, and preservation of unrelated work.

## Testing Strategy

Run commands from the repository root using the isolated environment.

Before test additions, establish the baseline:

```sh
python tests/runtests.py update_only_fields expressions model_fields.test_generatedfield defer --parallel=1 --verbosity=2
```

Run the two new tests before and after the production fix:

```sh
python tests/runtests.py \
  update_only_fields.tests.UpdateOnlyFieldsTests.test_update_fields_fk_expression \
  update_only_fields.tests.UpdateOnlyFieldsTests.test_update_fields_fk_expression_no_returning \
  --parallel=1 --verbosity=2
```

Repeat each command with the temporary settings directory on `PYTHONPATH` and:

```sh
--settings=refactor_opportunities_postgres
```

After the fix, rerun the baseline suite command on both backends. Known expected failures and legitimate feature skips must be recorded; unexpected failures must be resolved before acceptance. The new C1 regression cases must execute on both required backends.

No database writes, dependency installation, container creation, or test execution is authorized merely by approving this plan.

## Performance Considerations

Preserve native returning without an additional query. In fallback mode, retrieve the resolved field only when accessed. The formerly stale attribute may therefore trigger the deferred query already expected for the equivalent field-name spelling.

## Migration Notes

No schema or data migration is needed. Revert the localized production change and its regression tests together if required. Any later upstream contribution requires Django’s ticket, review, and AI-disclosure process.

## References

- [Verified research](research.md)
- [Documented expression-refresh contract](https://docs.djangoproject.com/en/dev/ref/models/expressions/#f-assignments-are-refreshed-after-model-save)
- [Intentional support for both field spellings: ticket #18362](https://code.djangoproject.com/ticket/18362)

## Progress

### Phase 1: Capture the alias-readback regression

#### Automated

- [x] 1.1 Existing selected suites pass on SQLite and PostgreSQL before test additions; expected failures and backend skips are recorded.
- [x] 1.2 New tests demonstrate the alias-specific failure in native and forced-fallback modes on both backends, with successful field-name controls.

### Phase 2: Reuse selected fields for expression readback

#### Automated

- [x] 2.1 New regression tests pass on SQLite and PostgreSQL in native and forced-fallback modes.
- [x] 2.2 Selected partial-save, expression, generated-field, and deferred-loading suites pass on both backends, with expected failures and skips recorded.
- [x] 2.3 Configured Black, isort, and Flake8 checks pass for the two changed Python files; `git diff --check` passes and task-owned temporary resources are removed.

#### Manual

- [ ] 2.4 Human diff review confirms the single selected-field decision, original signal spellings, unchanged refresh policy, and preservation of unrelated work.
