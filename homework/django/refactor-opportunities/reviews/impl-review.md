<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: C1: Consistent expression readback for partial saves

- **Plan**: context/changes/refactor-opportunities/plan.md
- **Scope**: Full plan (completed phases only; Phase 1 of 2)
- **Reviewed phases**: 1
- **Date**: 2026-11-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (saved execution evidence; fresh runtime verification blocked) |

## Findings

None in the reviewed phase.

## Scope and evidence

Progress completion is 5/6. Phase 1 is fully complete (2/2). Phase 2 is not fully complete (3/4): manual item 2.4 remains unchecked. Consequently Phase 2, including the production fix, is excluded from review coverage. This approval does not establish archive coverage for Phase 2 or complete the human review item.

The implementation is uncommitted against HEAD b501b8493f31cf8cba31211d59b3b78642b8cb02. Git scope was determined from the working-tree diff and change-local evidence rather than a date-derived commit range: the plan has no dated filename and this work has no implementation commits. Phase 1 owns the additions to tests/update_only_fields/tests.py and its verification evidence. The base.py change belongs to planned Phase 2. Staged query.py and test_bulk_update.py work belongs to the sibling change and was excluded. No lessons.md exists.

Two independent reviewers checked plan adherence and safety/pattern compliance. Tests exercise both spellings with fresh employees, existing profiles and PK-delta arithmetic, independent database reads, excluded-expression preservation, native/fallback query counts, fallback deferred state, and sender-scoped signals with cleanup and original field spellings. Existing adjacent tests establish compatible conventions. No substantive mismatch was found.

## Success criteria verification

Saved baseline logs show the selected update_only_fields, expressions, model_fields.test_generatedfield, and defer suites passing before additions: SQLite 334 tests (2 skipped, 1 expected failure), PostgreSQL 334 tests (22 skipped).

Saved red logs show both new tests executed against unchanged production code on both databases. Only profile_id subtests fail: native readback retains CombinedExpression and fallback does not defer profile_id. Field-name controls pass. Separate initial import-error logs are not treated as regression evidence.

The verification report, dependencies, cleanup, and preservation records document Python 3.12.13, PostgreSQL 16.15, task-owned temporary setup/removal, and preserved unrelated work. Removed temporary resources cannot be independently inspected now.

Fresh verification attempts during review:

- `python --version`: blocked, command not found. The plan's isolated environment was intentionally removed after execution.
- `python3 tests/runtests.py update_only_fields expressions model_fields.test_generatedfield defer --parallel=1 --verbosity=2`: blocked before test execution, Django module not found in the current interpreter environment.
- `PYTHONPATH=. python3 tests/runtests.py update_only_fields.tests.UpdateOnlyFieldsTests.test_update_fields_fk_expression update_only_fields.tests.UpdateOnlyFieldsTests.test_update_fields_fk_expression_no_returning --parallel=1 --verbosity=2`: blocked before execution, missing asgiref.
- PostgreSQL reruns were unavailable because task-owned settings, dependencies, and database resources were removed.
- `git diff --check`: PASS.

Success Criteria PASS is based on inspected historical execution evidence, not a successful fresh runtime rerun. Historical baseline/red checks cannot be faithfully repeated against the current fixed tree without reconstructing the earlier state. No dependencies or database resources were created during this review.

## Manual verification

Phase 1 has no manual criteria. Phase 2 manual item 2.4 remains pending and was not modified. No implementation, staging, or Progress changes were made.
