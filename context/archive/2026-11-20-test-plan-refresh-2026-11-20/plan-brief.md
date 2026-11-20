# Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-11-20/plan.md`
> Research: `context/changes/test-plan-refresh-2026-11-20/research.md`

## What & Why

Protect the author’s core decision-making flow: seeing earlier investment reasoning before saving another investment.

## Starting Point

The history feature and substantial lower-layer protection exist. Browser coverage does not currently prove the prior reasons appear after hydrated category selection.

## Desired End State

One focused scenario protects reason visibility, category switching and empty history, and runs automatically on qualifying PRs and master pushes.

## Key Decisions Made

| Decision                 | Choice                                                                    | Source                  |
| ------------------------ | ------------------------------------------------------------------------- | ----------------------- |
| Additional privacy tests | Skip; retain existing coverage                                            | User                    |
| Browser CI               | Focused job, not full suite                                               | User                    |
| Test boundary            | Real local page/database and disposable authentication                    | Research                |
| Assertions               | Literal reasons/results; panel-scoped identities; unchanged saved records | PRD and plan            |
| Financial omissions      | Remain deferred                                                           | Accepted research       |
| Delivery                 | Three phases                                                              | User-approved structure |

## Scope

Included: the history scenario, isolated browser project, focused CI job and guide updates.

Excluded: new privacy assertions, product changes, full-suite browser CI, hosted operations and previously accepted financial gaps.

## Architecture / Approach

Seed valid historical investments locally, authenticate through the application, and exercise category selection in Chromium. Reuse existing configuration and fixture conventions.

## Phases at a Glance

| Phase | Deliverable                   | Main risk                                        |
| ----- | ----------------------------- | ------------------------------------------------ |
| 1     | Scenario and isolated project | Fixtures or assertions fail for the wrong reason |
| 2     | Focused CI job                | Hidden reliance on shared account setup          |
| 3     | Verification and guide update | Documentation overstates completion              |

**Prerequisites:** Node matching the repository pin, Docker/local Supabase, Chromium dependencies, and existing CI package access.

**Estimated effort:** A small change across three verified phases; CI startup is the main operational cost.

## Risks & Assumptions

The planned test protects existing behavior rather than changing it. Build-then-dev serving does not establish hosted runtime parity. Branch protection changes remain outside scope.

## Success Criteria

- Matching reasons and results appear before saving and update correctly across category changes.
- The focused CI job runs without hosted or persistent E2E account credentials.
- The guide records verified protection and preserves deferred work.

## References

- Full plan and research linked above.
- PRD US-01 and FR-012.
