# Position Detail and Current Price — Plan Brief

> Full plan: `context/changes/position-detail-and-price/plan.md`

## What & Why

The author can open a position, read its full reason, type in its current price with the date
that price belongs to, and see the result — percentage, plus amount when quantity is known —
dated "as of" that price, both on the detail page and in the list. This is roadmap slice S-02. It
creates the result concept the north-star confrontation (S-03) depends on: without a current
price there is nothing to judge earlier positions by.

## Starting Point

S-01 records positions and lists them on `/dashboard`. Positions have no price columns, list rows
lead nowhere, and there is no way to read a long reason. The smoke walk already proves two-account
isolation for the list and the entry form.

## Desired End State

Each instrument in the list links to `/dashboard/positions/<id>`, which shows every field, the
reason with its line breaks, the result and a price form. A position without a price says
"No price yet". Another account, an unknown id or a malformed id all get the same 404 page. The
smoke walk proves the price update and that account B can neither read nor reprice A's position.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Result format | Percentage always; amount too when quantity is set | Works for every position (buy price is per share) and shows money when the data allows. |
| Price date | Entered by the author, default today, not future, not before buy date | The date describes the price itself, so a stale price never looks fresh. |
| Before the first price | "No price yet", no number | Never shows a figure the author did not enter; S-03 shows the same honest state. |
| Price storage | Latest price and date as two columns on `positions`, overwritten on update | Smallest migration and simplest list/S-03 queries; no FR asks for history. |
| Price form | Plain Astro form posting to the detail page, re-render on error | Two fields, no client state; same pattern as `/dashboard/new`. |
| Not-found | One 404 state for missing, foreign, deleted and malformed ids | Never reveals that an id exists for another account. |
| Deleted positions | Every by-id read/write filters `deleted_at is null` | RLS checks ownership only; agreed with `recoverable-delete` (S-05). |
| Verdict styling | No gain/loss colours; the sign carries direction | The PRD keeps results free of verdicts. |

## Scope

**In scope:**
- Migration with pair and date checks, down-script, regenerated types
- Result helper and shared result component; shared number/date formatting
- Detail page with full reason and price form; Result column and links in the list
- Smoke steps for detail, price, date validation and cross-account read/write isolation

**Out of scope:**
- Price history, live prices, currencies
- Closing positions (S-04), delete/restore UI (S-05), editing facts or reason (S-07)
- A unit/integration test framework

## Architecture / Approach

Astro page `/dashboard/positions/[id]` (gated by the existing `/dashboard` middleware prefix) calls
`getPosition` / `updatePositionPrice` in `src/lib/services/positions.ts`, always with the
request-scoped client so RLS applies. `src/lib/validation/price.ts` parses the form with the S-01
decimal and date rules. `src/lib/result.ts` computes the result once; `PositionResult.astro`
renders it in the list and on the detail page, and S-03 will reuse both.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Price columns | Two nullable columns, checks, down-script, types | `db reset` on the local stack shared with the S-05 worktree — use `migration up` |
| 2. Detail page and result | Detail page, price form, result in list and detail | Forgetting the `deleted_at` filter, which nothing on this branch can catch |
| 3. Smoke proof | Behaviour and two-account isolation steps | Scraping the position id from the list HTML |

**Prerequisites:** Docker running for local Supabase; the human pushes the Phase 1 migration to production (`npx supabase db push`) before this change merges.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Overwriting the price discards the previous one; accepted, since a price is not an entry the
  no-silent-data-loss guardrail protects. A history table can be added later without changing the result helper's contract.
- The `price_date >= buy_date` check will constrain S-07, which makes buy dates editable.
- The deleted-position filter is only verified after S-05 rebases onto this change.
- This change merges first; afterwards `database.types.ts` is regenerated, not hand-merged.

## Success Criteria (Summary)

- The author opens any position, reads its whole reason, sets a price, and sees a dated result in the detail view and the list.
- A position without a price never shows an invented number.
- The smoke walk proves another account can neither read nor reprice the author's position.
