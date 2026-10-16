# Confrontation Before Saving a New Investment — Plan Brief

> Full plan: `context/changes/reason-confrontation/plan.md`

## What & Why

While recording a new investment, the author sees their own earlier positions bought for the same
reason category, each with its reason and its result so far, before the entry is saved. This is
roadmap S-03 (US-01, FR-012), the north star: the product's core bet is that being confronted with
your own past reasoning at the moment of deciding improves how you invest. It presents history only,
with no verdict or score.

## Starting Point

`/dashboard/new` is a React island over a native POST that works without JS, and it re-renders on
error so reason text never goes into a URL. S-02 left a reusable result definition (`result.ts`,
`format.ts`) rendered only by an Astro component. S-05 left a hand-off: the confrontation must
exclude deleted positions.

## Desired End State

A "same reason" panel between the category control and the reason field updates instantly as the
author picks a category, or types a new category name that matches an existing one. It lists every
non-deleted position in that category, newest buy first, with instrument, buy date, a clamped reason
that expands in place, and the same "+x% as of …" / "No price yet" wording used elsewhere. A
category with no history shows an explanatory empty state. Without JS, the panel appears on a
re-render after a rejected submission.

## Key Decisions Made

| Decision                | Choice                                                           | Why (1 sentence)                                                                                                            | Source             |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Interaction model       | Live panel from preloaded data; no review step                   | Matches US-01 ("when they choose its category, they see"), costs no extra click against the 60 s NFR, and needs no endpoint | Plan               |
| No-JS behaviour         | Panel server-rendered on re-render only; saving never gated      | Accepted tradeoff of the live model; keeps the existing no-JS save path intact                                              | Plan               |
| Which positions         | All existing non-deleted in the category, regardless of buy date | US-01 says "existing positions"; back-filled entries still see the whole record                                             | Plan               |
| Typed new-category name | Case-insensitive match to an existing category shows its history | `createPosition` reuses that category, so an empty state would be false                                                     | Plan               |
| Reason text             | Clamped ~3 lines, inline "Show full reason" toggle               | Keeps several positions scannable without leaving the form                                                                  | Plan               |
| Order and cap           | Newest buy first, no cap                                         | Matches the dashboard and "every earlier position"; ranking by outcome would read as a verdict                              | Plan               |
| Deleted positions       | Excluded via `deleted_at is null`                                | S-05 hand-off; RLS checks ownership only                                                                                    | Research (archive) |
| Result wording          | One `describeResult()` shared by Astro and React                 | S-02 required one definition for list, detail and S-03                                                                      | Research (archive) |
| Verification            | Smoke walk + manual browser checks; no Playwright                | Follows three slices' convention; the privacy boundary is still proven automatically                                        | Plan               |

## Scope

**In scope:**

- Service read `listConfrontationPositions` and the `ConfrontationPosition` DTO
- `describeResult()` extraction, used by `PositionResult.astro` and the island
- `ConfrontationPanel.tsx`: hint, list, empty, load-failure and typed-match states
- Smoke steps for the no-JS panel, deleted exclusion and restore, typed match, empty state and cross-account isolation

**Out of scope:**

- Review or confirm step, gating the save
- Aggregates, win rates, colours, ordering by outcome
- Buy-date filtering, a cap or "show all", links to detail pages
- Closed-position results (S-04), JSON endpoints, Playwright, schema changes

## Architecture / Approach

`new.astro` loads categories and all non-deleted positions (with `category_id` and `reason_text`)
and passes both to `PositionForm`. The island derives the panel's category from the select or the
typed name, filters the preloaded list, and renders `ConfrontationPanel`. Because the derivation
runs from initial values during SSR, the no-JS re-render shows the same panel with no second code
path.

## Phases at a Glance

| Phase                                           | What it delivers                                             | Key risk                                                                |
| ----------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1. Confrontation data and shared result wording | Read, DTO, `describeResult()`, page load tolerant of failure | Extraction changes existing result wording                              |
| 2. Confrontation panel in the form              | Live panel with all states, no-JS re-render                  | Panel gated on hydration, so no-JS loses it; copy drifts into a verdict |
| 3. Smoke proof                                  | HTTP assertions incl. B never receives A's reasons           | Steps placed before the walk has the required state                     |

**Prerequisites:** S-01 and S-02 done (both are); local Supabase running for smoke.
**Estimated effort:** ~2–3 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- A no-JS author on a first load can save without seeing the panel. This is accepted by choosing the live model.
- Every reason text of the author is in the page source of `/dashboard/new`. This is acceptable because the page is gated and RLS-scoped, and smoke proves the cross-account boundary.
- The panel may grow long for a much-used category. No cap, by decision. Paging stays deferred.

## Success Criteria (Summary)

- Choosing a category while recording shows every earlier non-deleted same-category position with its reason and dated result, or an explanatory empty state, before saving.
- The panel never shows another account's data and never offers a verdict.
- Recording a position still takes under 60 seconds.
