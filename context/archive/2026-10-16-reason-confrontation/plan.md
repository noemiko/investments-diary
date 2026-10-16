# Confrontation Before Saving a New Investment Implementation Plan

## Overview

While recording a new investment on `/dashboard/new`, the author sees every earlier position of
theirs in the chosen reason category, each with what was bought, its reason text and its current
result, or an explanatory empty state. All of this appears before the entry is saved (US-01,
FR-012, roadmap S-03). The panel presents history as a prompt to reflect. It gives no verdict,
score or aggregate.

## Current State Analysis

- `/dashboard/new` (`src/pages/dashboard/new.astro:40-64`) handles its own POST. On error it
  re-renders with the submitted values instead of redirecting, so reason text never goes into a URL
  (`new.astro:12-13`). It loads categories in a `try/catch` and shows a failed read as `errors.form`,
  not as a 500 (`new.astro:58-64`).
- `PositionForm.tsx` is a `client:load` React island over a native `<form method="POST">`
  (`src/components/positions/PositionForm.tsx:110`). The form must keep working without JS: the
  select always posts `category_id`, `"__new__"` (`NEW_CATEGORY_CHOICE`, `src/types.ts:47`) means
  "use `new_category_name`", and the name input is always in the server HTML, hidden after
  hydration (`PositionForm.tsx:61-67`, `:185-197`).
- The result definition was built for reuse by S-03: `positionResult()` in `src/lib/result.ts:16-30`
  and `formatPercent` / `formatDate` in `src/lib/format.ts`. Its only renderer is
  `src/components/positions/PositionResult.astro`, an Astro component that cannot be used inside the
  React island. Display is percent only, `+20.00% as of Oct 15, 2026`, or `No price yet`, with no
  gain/loss colours (archived S-02 `plan.md:63-64`, `change.md:21`).
- Data access goes through `src/lib/services/positions.ts` with the request-scoped client. RLS checks
  ownership only, so every read filters `deleted_at is null` itself (`positions.ts:59`, `:81`). S-05
  left an explicit hand-off: the confrontation must use the same deleted filter (archived S-05
  `plan.md:76-77`).
- `createPosition` resolves a typed new-category name to an existing category by case-insensitive
  match (`positions.ts:161-167`), so "New category…" can still file the entry under a category that
  already has history.
- Closed positions do not exist yet (S-04). Every position is open, and its result is the
  open-position result.
- There is no unit-test runner, by decision across S-01, S-02 and S-05. Verification is the `verify`
  skill plus the HTTP smoke walk `scripts/smoke.mjs`, which cannot execute island JS.

## Desired End State

On `/dashboard/new`, a "same reason" panel sits between the category control and the reason
textarea:

- No category chosen: a one-line hint to choose a category to see earlier positions bought for the
  same reason.
- An existing category chosen, or "New category…" with a typed name that matches an existing
  category case-insensitively: every non-deleted position in that category, regardless of its buy
  date, newest buy first (buy date desc, then created desc), with no cap. Each shows the instrument,
  the buy date, the reason clamped to about three lines with an inline "Show full reason" toggle (or
  "No reason written"), and its result in the shared wording. A typed-name match also says that the
  entry will join that existing category.
- A category with no positions, or a typed name matching none: an explanatory empty state saying
  this will be the first position recorded for this reason.
- Earlier positions that failed to load: a notice in the panel. The form still saves.

Changing the select or the typed name updates the panel instantly. Without JS, the panel is
server-rendered for the category in the submitted values when the form re-renders after a rejected
submission. On a first no-JS load it shows the hint. The smoke walk proves the server-side behaviour
and the privacy boundary. A manual browser check proves the live reveal.

### Key Discoveries:

- `src/lib/result.ts:16-17`: the "single definition of a position's result (S-02, reused by S-03 and
  S-04)". Do not re-derive the formula in the island.
- `src/pages/dashboard/new.astro:58-64`: a failed side read must not cost the author what they typed.
  Apply the same pattern to the confrontation read.
- `src/lib/services/positions.ts:52-67`: `listPositions` is the precedent for ordering and for the
  deleted filter. It does not select `reason_text` or `category_id`, so the confrontation needs its
  own read.
- `src/lib/services/positions.ts:161-167`: the case-insensitive name match the typed-name lookup must
  agree with.
- `scripts/smoke.mjs:72-80`, `:229-230`: smoke reads server HTML, captures ids through
  `data-category-id`, and already asserts no-JS form behaviour.

## What We're NOT Doing

- No review or confirm step before saving. The panel is live and informational. It does not gate
  saving, so a no-JS author on a first load can save without seeing it.
- No aggregates, averages, win rates, counts framed as evidence, gain/loss colours, or ordering by
  outcome. The PRD forbids any verdict or statistical claim.
- No filtering by buy date. A back-filled entry with an old buy date is still shown every existing
  position in its category.
- No cap or "show all" on the list.
- No links from the panel to position detail pages. Leaving the form could cost the half-typed entry.
- No closed-position results. S-04 owns closing, and the panel will show final results once
  `positionResult` handles them.
- No JSON API endpoint and no client fetch. Data is loaded with the page.
- No Playwright or other browser-test dependency.
- No schema change and no new index. At single-user scale the unindexed `category_id` is fine.
- No showing the amount result. It stays computed but unrendered, as in S-02.

## Implementation Approach

Load the author's non-deleted positions, with `category_id` and `reason_text`, in the
`/dashboard/new` frontmatter alongside categories, and pass them to the existing island as a prop.
The island derives the panel's category from state it already holds: the select value, or the
typed new-category name matched against the categories list with the same lower-casing rule as
`createPosition`. It then filters the preloaded list. Because the island is server-rendered with its
initial values, the same derivation produces the no-JS panel on a re-render without a separate code
path. A pure `describeResult()` extracted into `src/lib/result.ts` keeps the "No price yet" / "+x% as
of …" wording identical between `PositionResult.astro` and the island.

## Critical Implementation Details

- **Privacy surface:** island props are serialised into the page HTML, so every non-deleted reason
  text of the signed-in author is present in the source of `/dashboard/new`. That is acceptable
  because the page is gated and the read uses the RLS-bound client. It is also why the smoke walk
  must assert that account B's `/dashboard/new` contains none of A's reason text.
- **No-JS parity:** the panel must render from the island's initial state during SSR, not only after
  hydration. Do not gate it on the `hydrated` flag at `PositionForm.tsx:63-67`, or the no-JS
  re-render loses it.

## Phase 1: Confrontation data and shared result wording

### Overview

Provide the data the panel needs on `/dashboard/new` and one shared description of a result, with
no visible UI change yet.

### Changes Required:

#### 1. Confrontation DTO

**File**: `src/types.ts`

**Intent**: Define the shape of one earlier position as the panel needs it, derived from the
generated row type like the other DTOs.

**Contract**: `ConfrontationPosition` = `Pick<PositionRow, "id" | "category_id" | "instrument" |
"buy_date" | "buy_price" | "quantity" | "current_price" | "price_date" | "reason_text">`. It needs
no category name, because the panel already knows which category it shows.

#### 2. Confrontation read

**File**: `src/lib/services/positions.ts`

**Intent**: Add a read of all the author's non-deleted positions with the fields above, so the island
can group them by category without another round trip.

**Contract**: `listConfrontationPositions(client: Client): Promise<ConfrontationPosition[]>`. It
filters `.is("deleted_at", null)` (S-05 hand-off), orders by `buy_date` desc then `created_at` desc
(same as `listPositions`), throws on error like the other list reads, and uses the request-scoped
client.

#### 3. Shared result description

**Files**: `src/lib/result.ts`, `src/components/positions/PositionResult.astro`

**Intent**: Extract the text `PositionResult.astro` renders into a pure function, so the Astro
component and the React island show identical wording from one definition.

**Contract**: `describeResult(input: PositionResultInput): { percent: string; asOf: string } | null`.
It returns `formatPercent(result.percent)` and `as of ${formatDate(result.priceDate)}`, or `null`
for no price. `PositionResult.astro` renders from it with unchanged markup and output, still
rendering `No price yet` for `null`. Keep the `NO_PRICE` wording in one place that both renderers
use.

#### 4. Load on the new-investment page

**File**: `src/pages/dashboard/new.astro`

**Intent**: Load confrontation positions next to categories on both GET and POST re-render. A failed
read becomes a panel-level notice and never blocks saving or loses typed values.

**Contract**: a separate `try/catch` around `listConfrontationPositions`. On failure, pass
`earlierPositions = null` (meaning "could not load") rather than `[]` (meaning "none"), and do not
touch `errors.form`. Pass `earlierPositions` to `PositionForm`.

### Success Criteria:

#### Automated Verification:

- The `verify` skill passes (astro sync, lint, astro check, build)
- `BASE_URL=http://localhost:4321 npm run smoke` passes unchanged against local Supabase

#### Manual Verification:

- The dashboard list and a detail page show results with wording identical to before the extraction (one priced and one unpriced position)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Confrontation panel in the form

### Overview

Render the live "same reason" panel inside the island, driven by the category choice and the typed
name, with all states, and server-rendered on a no-JS re-render.

### Changes Required:

#### 1. Panel component

**File**: `src/components/positions/ConfrontationPanel.tsx` (new)

**Intent**: A presentational component that receives the resolved state and renders the hint, the
list, the empty state or the load-failure notice. The copy invites reflection: a heading along the
lines of "You've bought for this reason before", with "How did it go?" framing. It makes no claim.

**Contract**: props carry a discriminated state: `"no-category"` | `"unavailable"` |
`{ positions: ConfrontationPosition[]; existingCategoryName?: string }`. An empty `positions` array
renders the empty state. `existingCategoryName` is set only for a typed-name match and renders a
"will be filed under existing category <name>" line. Each item shows instrument, `formatDate(buy_date)`,
reason (or "No reason written") and result through `describeResult()`. The root carries
`data-confrontation` and each item carries `data-confrontation-position-id="<id>"` as stable smoke
anchors. Use `cn()` and existing tokens. Use no colour for results.

#### 2. Clamped reason with inline expand

**File**: `src/components/positions/ConfrontationPanel.tsx`

**Intent**: Clamp each reason to about three lines with a "Show full reason" / "Show less" toggle
that expands in place, keyboard-operable, and shown only when the text is long enough to clamp.

**Contract**: a `<button type="button">` with `aria-expanded`, so it never submits the form. The full
text is always in the DOM (clamping is CSS), so it is readable without JS and present for smoke.

#### 3. Wire into the form

**Files**: `src/components/positions/PositionForm.tsx`, `src/pages/dashboard/new.astro`

**Intent**: Accept `earlierPositions: ConfrontationPosition[] | null`, derive the panel state from
`categoryChoice` and `values.new_category_name`, and render the panel between the category control
(and new-name field) and the reason textarea.

**Contract**: derivation rules:

- `categoryChoice === ""` → `no-category`.
- An existing id → the positions with that `category_id`.
- `NEW_CATEGORY_CHOICE` → `trim().toLowerCase()` of the typed name, matched against
  `categories[].name.toLowerCase()` (same rule as `findCategoryId`, `positions.ts:161-167`). A match
  gives that category's positions plus `existingCategoryName`. An empty name or no match gives `[]`.
- `earlierPositions === null` → `unavailable`, whenever a category is chosen.

The filter keeps the preloaded order. The derivation runs during SSR from initial values and does
not depend on `hydrated`. When there are no categories at all, `categoryChoice` defaults to
`NEW_CATEGORY_CHOICE`, so the panel shows the empty state.

### Success Criteria:

#### Automated Verification:

- The `verify` skill passes (astro sync, lint, astro check, build)
- `BASE_URL=http://localhost:4321 npm run smoke` passes unchanged against local Supabase

#### Manual Verification:

- With JS: choosing a category instantly shows its earlier positions newest buy first, each with instrument, buy date, reason and dated result or "No price yet"
- With JS: switching categories updates the panel; a category with no positions shows the empty state
- With JS: "New category…" with a name matching an existing category in different case shows that category's history and the "existing category" line; a non-matching name shows the empty state
- A deleted position never appears in the panel, and reappears after restore
- A long reason is clamped and expands and collapses in place by mouse and keyboard without submitting the form
- With JS disabled: a submission rejected by validation (e.g. empty instrument) re-renders with the panel for the submitted category and all typed values intact
- The panel contains no verdict, score, aggregate or gain/loss colour
- Recording a position with a known category still takes under 60 seconds (timed once)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Smoke proof

### Overview

Extend `scripts/smoke.mjs` so the server-side behaviour and the privacy boundary of the confrontation
are proven on every run.

### Changes Required:

#### 1. Confrontation steps

**File**: `scripts/smoke.mjs`

**Intent**: Assert, over plain HTTP, what the server sends for the panel. Follow the existing step,
`includes`/`excludes` and `requiresIds` conventions, use run-unique strings, and give the deleted
position its own run-unique reason text so its exclusion is checkable.

**Contract**: new steps, placed where the required state exists in the walk:

- A: a rejected POST to `/dashboard/new` (empty instrument) with `category_id = ids.category`
  re-renders 200 with `data-confrontation`, the main position's reason text and its
  `data-confrontation-position-id`.
- A: the same re-render, while the delete-test position is deleted, excludes that position's id and
  reason text. After restore, it includes them.
- A: a rejected POST with `category_id="__new__"` and the existing category name in different case
  re-renders with that category's positions.
- B: a rejected POST with a run-unique new category name re-renders with the empty state and no
  position ids.
- B: `GET /dashboard/new` excludes A's reason texts and position ids.

### Success Criteria:

#### Automated Verification:

- `BASE_URL=http://localhost:4321 npm run smoke` passes with the new confrontation steps against local Supabase
- The `verify` skill passes (astro sync, lint, astro check, build)

#### Manual Verification:

- A deliberate break (e.g. temporarily dropping the `deleted_at` filter in `listConfrontationPositions`) makes the deleted-exclusion step fail, then is reverted

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. There is no unit-test runner, consistent with S-01, S-02 and S-05. `describeResult()` and the
  derivation rules are covered through smoke (server render) and the manual checks.

### Integration Tests:

- Smoke walk (Phase 3): no-JS re-render panel, deleted exclusion and restore, typed-name match,
  empty state, cross-account isolation of reason text.

### Manual Testing Steps:

1. Sign in with three categories: one with several positions (one unpriced, one with a long reason),
   one with none, and one used only by a deleted position.
2. On `/dashboard/new`, switch between the categories and check the list, the order, the empty state
   and the deleted exclusion.
3. Choose "New category…" and type an existing name in different case, then a new name.
4. Expand and collapse a long reason by keyboard. Confirm the form is not submitted.
5. Disable JS, submit with an empty instrument, and confirm the panel and the typed values on the
   re-render.
6. Time one full entry with a known category.

## Performance Considerations

The page now loads all non-deleted positions with reason text. Reasons are at most 10,000 characters
each, and the diary has single-user, small data volume (PRD `target_scale`). Paging stays deferred,
as in S-05's follow-ups.

## Migration Notes

None. No schema change.

## References

- PRD: `context/foundation/prd.md` (US-01, FR-012, Business Logic, NFR under 60 seconds)
- Roadmap: `context/foundation/roadmap.md` S-03
- Result reuse: archived `2026-10-15-position-detail-and-price/plan.md:74-75`, `:166-168`
- Deleted-filter hand-off: archived `2026-10-15-recoverable-delete/plan.md:76-77`
- No-JS form precedent: archived `2026-09-25-record-first-investment/reviews/impl-review.md:46-58`
- Patterns: `src/pages/dashboard/new.astro:58-64`, `src/lib/services/positions.ts:52-67`, `:161-167`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Confrontation data and shared result wording

#### Automated

- [x] 1.1 The `verify` skill passes (astro sync, lint, astro check, build) — cac57fb
- [x] 1.2 `BASE_URL=http://localhost:4321 npm run smoke` passes unchanged against local Supabase — cac57fb

#### Manual

- [x] 1.3 The dashboard list and a detail page show results with wording identical to before the extraction (one priced and one unpriced position) — cac57fb

### Phase 2: Confrontation panel in the form

#### Automated

- [x] 2.1 The `verify` skill passes (astro sync, lint, astro check, build) — 16e3a50
- [x] 2.2 `BASE_URL=http://localhost:4321 npm run smoke` passes unchanged against local Supabase — 16e3a50

#### Manual

- [x] 2.3 With JS: choosing a category instantly shows its earlier positions newest buy first, each with instrument, buy date, reason and dated result or "No price yet" — 16e3a50
- [x] 2.4 With JS: switching categories updates the panel; a category with no positions shows the empty state — 16e3a50
- [x] 2.5 With JS: "New category…" with a name matching an existing category in different case shows that category's history and the "existing category" line; a non-matching name shows the empty state — 16e3a50
- [x] 2.6 A deleted position never appears in the panel, and reappears after restore — 16e3a50
- [x] 2.7 A long reason is clamped and expands and collapses in place by mouse and keyboard without submitting the form — 16e3a50
- [x] 2.8 With JS disabled: a submission rejected by validation (e.g. empty instrument) re-renders with the panel for the submitted category and all typed values intact — 16e3a50
- [x] 2.9 The panel contains no verdict, score, aggregate or gain/loss colour — 16e3a50
- [x] 2.10 Recording a position with a known category still takes under 60 seconds (timed once) — 16e3a50

### Phase 3: Smoke proof

#### Automated

- [x] 3.1 `BASE_URL=http://localhost:4321 npm run smoke` passes with the new confrontation steps against local Supabase
- [x] 3.2 The `verify` skill passes (astro sync, lint, astro check, build)

#### Manual

- [x] 3.3 A deliberate break (e.g. temporarily dropping the `deleted_at` filter in `listConfrontationPositions`) makes the deleted-exclusion step fail, then is reverted
