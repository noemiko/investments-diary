# C1 — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Correct inconsistent expression readback when a partial save names a foreign key by its attribute spelling. Both spellings already select the same database field; they should follow the same documented refresh policy.

## Starting Point

The write path accepts both names. Readback repeats a narrower name check, leaving an expression unresolved for `profile_id`. Existing tests cover aliases and expressions separately.

## Desired End State

Either spelling yields the resolved key immediately when UPDATE returning is supported, or retrieves it on first access otherwise. Unselected expressions and original signal spellings remain protected.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Candidate | C1 only | Demonstrated behavioral inconsistency with a local remedy | Plan |
| Readback | Reuse selected fields | Removes the divergent second decision | Research / Plan |
| Validation | SQLite and PostgreSQL | Checks two real drivers and both readback branches | Plan |
| Delivery | Local exercise | Upstream preparation is outside the requested outcome | Plan |
| Other candidates | Defer C2–C4 | No additional structural change is justified here | Research / Plan |

## Scope

**In scope:** localized field-selection cleanup, backend-portable regressions, signal/exclusion guards, and database verification.

**Out of scope:** result-protocol abstractions, dependency restructuring, unrelated cleanup, new fetch-mode/async combinations, upstream submission, and native non-returning-driver verification.

## Architecture / Approach

Keep the persistence structure intact. Readback consumes the concrete fields already selected for writing, removing the redundant spelling check.

## Phases at a Glance

| Phase | Deliverable | Key risk |
|---|---|---|
| 1. Capture regression | Baseline plus demonstrated failures on both databases | Confusing environment failures with bug evidence |
| 2. Fix and verify | Local production change with passing tests | Altering deferred reads or signal payloads |

**Prerequisites:** Python 3.12, dependency installation access, and a working Docker engine for disposable PostgreSQL 16.
**Estimated effort:** approximately 1–2 implementation sessions, depending on environment setup.

## Open Risks & Assumptions

- Docker availability and fresh runtime results remain implementation prerequisites.
- Forced fallback verifies Django’s branch, not a native MySQL/MariaDB driver.
- Existing staged bulk-update work must remain intact.

## Success Criteria

- Both aliases return the same resolved key under the documented query policy.
- Selected suites pass on SQLite and PostgreSQL.
- Human review confirms the change stays local and preserves surrounding contracts.
