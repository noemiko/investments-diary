# Investments Diary observability plan brief

[Full plan](plan.md)

## What & Why

Give responders enough information to diagnose market provider failures and find regressions that block valid investment saves. These are the two high-severity findings from the November 19 audit.

## Starting Point

The application already reports handled failures to platform logs and Sentry. Market events lose diagnostic detail, and some database failures bypass reporting when classified as form validation.

## Desired End State

Responders can identify a market failure by provider, stage, reason, status when available, and affected count for batch failures. Expired selections prompt reselection, and unexpected database rejections produce a safe diagnostic event.

## Key Decisions Made

| Decision | Choice | Rationale |
| --- | --- | --- |
| Batch reporting | One summary per actionable reason in each batch | Keeps reasons queryable and event volume bounded |
| Receipt rejection | Match the existing SQLSTATE and exact guard text | Keeps this an application-only rollout |
| Delivery | Two phases, one per audit finding | Gives each fix a separate verification and commit boundary |

## Scope

Market search and downloads, new investment creation, and the shared telemetry fields needed by those paths. MP1 and NI1 define the scope.

## Architecture / Approach

Reuse the existing reporter and strict tag allowlists. Aggregate market outcomes at the service boundary and distinguish known receipt and foreign-key outcomes at the investment insert boundary.

## Phases at a Glance

| Phase | Deliverable | Key risk |
| --- | --- | --- |
| 1. Market diagnostics | Safe reason and stage tags, status, and batch counts | Excess event volume or private provider data reaching telemetry |
| 2. Investment save errors | Quiet expected rejections and one signal for unmapped failures | Incorrect matching of the database guard or constraint signature |

**Prerequisites** include the repository’s Node runtime, installed dependencies, and a running local Supabase stack for Phase 2. **Estimated effort** is two focused implementation phases plus local verification.

## Open Risks & Assumptions

The application relies on the exact current receipt-guard signature. An authenticated database test pins it. Verification uses local services and synthetic inputs.

## Success Criteria

- Responders can distinguish and count actionable market failures from safe telemetry.
- Receipt rejection preserves the draft and prompts stock reselection.
- Unexpected post-validation database failures generate one safe event.

## References

[November 19 observability audit](../../audits/observability/2026-11-19_market-prices-wallet-snapshots-new-investments.md)
