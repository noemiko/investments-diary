# Resolve HIGH dependency findings — Plan Brief

> Full plan: `context/changes/fix/plan.md`

## What & Why

Remove the 10 HIGH dependency entries and prevent recurrence through blocking CI audits.

## Starting Point

The audit has 10 HIGH and 23 MODERATE affected packages. Existing ranges permit patched transitives; verification and smoke checks already exist.

## Desired End State

Both trees have zero HIGH/CRITICAL findings, clean installation and regressions pass on Node 24.21.0, and CI enforces the threshold.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Severity | HIGH/CRITICAL | Requested scope |
| Updates | Targeted transitives | Minimize churn |
| Prevention | Both CI audits | Detect future advisories |
| Compatibility | Preserve direct declarations/overrides | Avoid broad upgrades |
| Verification | Static, unit, privacy, local smoke | Existing acceptance bar |

## Scope

In scope: affected lockfile chains, CI audit steps, verification evidence.
Out of scope: moderate-only fixes, broad upgrades, application changes, new services, deployment.

## Architecture / Approach

Refresh affected transitives within constraints, inspect nested copies, prove clean installation, run existing checks.

## Phases at a Glance

| Phase | Delivers | Risk |
| --- | --- | --- |
| 1 | Patched resolutions | Registry/resolver constraints |
| 2 | Blocking CI audits | Registry failures also fail CI |
| 3 | Regression evidence | Local service prerequisites |

Prerequisites: Node 24.21.0, private package read access, Docker, local Supabase.
Estimated effort: half a day excluding credential recovery or unexpected incompatibility.

## Open Risks & Assumptions

Candidates remain to be resolved and tested. Moderate advisories may remain. No hosted actions are required.

## Success Criteria (Summary)

- Zero HIGH/CRITICAL in both trees.
- Clean installation and required regressions pass.
- Both blocking CI audits exist.

## References

See full plan for baseline, repository rules, verification contract and npm documentation.
