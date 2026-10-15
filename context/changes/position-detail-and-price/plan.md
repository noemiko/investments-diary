# Position Detail and Current Price Implementation Plan

## Overview

The author can open one position, read its full written reason, set its current price with the
date that price belongs to, and see the position's result with that date — on the detail page and
in the positions list. This is roadmap slice S-02 (FR-006, FR-011, NFR "every displayed result
states the date of the price it was computed from"). It introduces the result concept that S-03
(the confrontation) and S-04 (closing) build on.

Runs in parallel with `recoverable-delete` (S-05) in a separate worktree; see
`context/changes/position-detail-and-price/change.md` for the coordination rules. This change
merges first.

## Current State Analysis

- `positions` (`supabase/migrations/20260929141102_create_diary_core.sql`) has no price columns.
  It carries `deleted_at` and an owner-only update policy, so a price update needs no new policy.
- `/dashboard` lists positions through `listPositions` (`src/lib/services/positions.ts`) and renders
  them in `src/components/positions/PositionsTable.astro`; rows do not link anywhere and there is no
  result column.
- `/dashboard/new` (`src/pages/dashboard/new.astro`) is the pattern for a form page: it handles its
  own POST, re-renders with values and per-field errors on failure, and redirects on success.
- Validation lives in `src/lib/validation/position.ts` (zod from `astro/zod`); decimal parsing in
  `src/lib/validation/decimal.ts` accepts `,` or `.` and fits `numeric(20,8)`.
- There is no test framework. The bar is the `verify` skill plus the smoke walk
  (`scripts/smoke.mjs`), which already proves two-account isolation for the list and the form.

## Desired End State

- `/dashboard/positions/<id>` shows instrument, category, buy date, buy price, quantity, broker,
  the full reason text, the result and a price form. A missing, foreign or deleted id renders the
  same 404 "Position not found" state.
- The author sets a current price and a price date (today by default, never in the future, never
  before the buy date). Saving replaces the previous price and returns to the detail page.
- Result = percentage change from buy price to current price, always; plus the absolute amount
  `(current − buy) × quantity` when quantity is set. Every result reads "as of <price date>".
  A position without a price shows "No price yet" and no number.
- The positions list has a Result column with the same content, and each instrument links to its
  detail page.
- The smoke walk proves the detail page, the price update, its date validation, and that account B
  can neither read nor reprice account A's position.

Verify with the `verify` skill and `npm run smoke` against local Supabase.

### Key Discoveries:

- Buy price is per share (S-01 decision, `context/archive/2026-09-25-record-first-investment/plan-brief.md`), so a percentage needs no quantity.
- RLS `positions_select_own` / `positions_update_own` check only `auth.uid() = user_id`, not `deleted_at` (`supabase/migrations/20260929141102_create_diary_core.sql:62-69`). Every by-id read or write must add `deleted_at is null` itself.
- An update the RLS `using` clause hides affects zero rows without an error, so "zero rows updated" is the not-found signal for foreign, deleted and unknown ids alike.
- A non-uuid id reaching PostgREST is a `22P02` error, not an empty result — the page must reject it before querying.
- `formatDate` and the number formatter are local to `PositionsTable.astro:12-17`; the detail page needs them too.
- The migration convention puts the down-script in `supabase/rollbacks/` (`supabase/rollbacks/20260929141102_create_diary_core.down.sql`), and the schema ships in its own phase so a human can push it to production before dependent code merges.

## What We're NOT Doing

- Price history: a new price overwrites the previous one (decided: latest price on the position).
- A live price source (PRD non-goal).
- Showing a result derived from the buy price before any price is entered (decided: "No price yet").
- Updating the price of a closed position, sell price, final result (S-04).
- Delete or restore UI anywhere, including the detail page (owned by S-05).
- Editing instrument, buy price, dates, quantity, broker or reason (S-07).
- Gain/loss colouring or any other verdict styling — the sign carries the direction; the PRD keeps
  results free of verdicts. Easy to add later if wanted.
- Currencies: amounts are unitless, like prices today.
- A unit or integration test framework.

## Implementation Approach

Same shape as S-01: schema first, in its own phase, so the human can push it to production before
anything reads the new columns; then the user-facing flow through the request-scoped, RLS-bound
service layer; then the smoke walk turns the behaviour and privacy expectations into checks.

The result is computed in one pure helper and rendered by one shared component, so the list, the
detail page and later S-03 show the same numbers and wording. The price form is a plain Astro
`<form method="POST">` (two fields, no client state), posting to the detail page itself.

## Critical Implementation Details

- **Deleted positions:** `getPosition` and `updatePositionPrice` must both filter
  `deleted_at is null`. Nothing on this branch can delete a position yet, so this cannot be
  exercised here; S-05 verifies it after rebasing onto this change.
- **Price date versus buy date:** the database check `price_date >= buy_date` holds today because
  nothing edits `buy_date`. S-07 will make buy dates editable and must reject a buy date later than
  an existing price date, or the update will fail with a check violation.

## Phase 1: Price columns

### Overview

Add the current price and its date to `positions`, with a tested down-script and regenerated
types. No user-visible change.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<UTC YYYYMMDDHHmmss>_add_position_current_price.sql` (scaffold with `/migration add_position_current_price`)

**Intent**: Store the latest current price per position and the date that price belongs to
(FR-006), with database checks that keep the pair consistent.

**Contract**: `positions.current_price numeric(20,8)` nullable, `check (current_price > 0)`;
`positions.price_date date` nullable; named check `positions_price_pair_check`:
`(current_price is null) = (price_date is null)`; named check `positions_price_date_check`:
`price_date >= buy_date`. "Not in the future" stays in application code, for the reason given in
the S-01 migration header. No new policy: the existing owner-only update policy covers it. Header
comment states that a new price overwrites the old one by design.

#### 2. Down-script

**File**: `supabase/rollbacks/<same timestamp>_add_position_current_price.down.sql`

**Intent**: The tested down-path the deploy rules require.

**Contract**: Drops both checks and both columns. Header warns it discards every entered price.

#### 3. Generated database types

**File**: `src/db/database.types.ts`

**Intent**: Keep the schema the single source of types.

**Contract**: Regenerated from the local database (`npx supabase gen types typescript --local`);
`positions` Row/Insert/Update gain `current_price: number | null` and `price_date: string | null`.

### Success Criteria:

#### Automated Verification:

- The migration applies to the local database (`npx supabase migration up`; use `npx supabase db reset` only if the `recoverable-delete` worktree has no migration of its own)
- Both checks reject bad rows: in `psql`, an update setting only `current_price`, a `current_price` of 0, and a `price_date` before `buy_date` each fail
- Down-script round trip succeeds locally: apply it with `psql`, confirm both columns are gone, re-apply the migration
- Regenerating `src/db/database.types.ts` produces no diff
- `verify` skill sequence passes (astro sync, lint, astro check, build)

#### Manual Verification:

- Human runs `npx supabase db push` against production and confirms in Studio that both columns exist on `positions`, before this change is merged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Detail page and result

### Overview

The detail page with full reason and price form, the shared result helper and component, and the
Result column plus links in the list.

### Changes Required:

#### 1. Shared formatting

**File**: `src/lib/format.ts` (new); `src/components/positions/PositionsTable.astro`

**Intent**: One number and date format for the list, the detail page and later S-03.

**Contract**: Exports `formatNumber(value)` (en-US, up to 8 fraction digits — the current
`numberFormat`) and `formatDate(isoDate)` (en-US medium, UTC — the current `formatDate`).
`PositionsTable.astro` imports them instead of defining its own.

#### 2. Result helper

**File**: `src/lib/result.ts` (new)

**Intent**: The single definition of a position's result, reused by S-03 and S-04.

**Contract**: `positionResult({ buy_price, quantity, current_price, price_date })` returns `null`
when `current_price` is null, else `{ percent, amount, priceDate }` where
`percent = (current_price − buy_price) / buy_price × 100`, `amount = (current_price − buy_price) × quantity`
or `null` when quantity is null, and `priceDate = price_date`. Pure, no I/O.

#### 3. Result component

**File**: `src/components/positions/PositionResult.astro` (new)

**Intent**: Render a result identically wherever it appears.

**Contract**: Props: the position's price fields. Renders `+20.00%` (two decimals, sign shown
except for zero), then ` · +100` when an amount exists (up to two decimals, sign shown except for
zero), then `as of <formatDate(price_date)>`; or `No price yet` when there is no result. Uses
tabular numbers; no gain/loss colours.

#### 4. Types

**File**: `src/types.ts`

**Intent**: DTOs for the list row, the detail view and the price form.

**Contract**: `PositionListItem` gains `current_price` and `price_date`. New `PositionDetail` =
`PositionListItem` + `reason_text`. New `PriceUpdateInput` (`current_price: number`, `price_date: string`),
`PRICE_FORM_FIELDS = ["current_price", "price_date"]`, `PriceFormValues`, `PriceFormErrors`
(per field plus `form`), mirroring the position-form types.

#### 5. Price validation

**File**: `src/lib/validation/price.ts` (new); `src/lib/validation/position.ts`

**Intent**: Parse the two-field price form with the same number and date rules as the entry form.

**Contract**: `readPriceForm(form: FormData): PriceFormValues` and
`parsePriceForm(values, buyDate): { success: true; data: PriceUpdateInput } | { success: false; errors: PriceFormErrors }`.
`current_price`: required, `parseDecimal`, > 0 — messages "Enter the current price",
`NUMBER_MESSAGE`, `POSITIVE_MESSAGE`. `price_date`: required ("Enter the price date"), a calendar
date ("Enter a valid date"), not after `todayUtc()` ("The price date cannot be in the future"),
not before `buyDate` ("The price date cannot be before the buy date"). The shared pieces
(`requiredDecimal`, `isCalendarDate`) are exported from `position.ts` rather than copied.

#### 6. Service

**File**: `src/lib/services/positions.ts`

**Intent**: Read one position and update its price, always through the request-scoped client and
never touching deleted positions.

**Contract**:
- `listPositions` also selects `current_price, price_date`.
- `getPosition(client, id): Promise<PositionDetail | null>` — filters `id` and `deleted_at is null`,
  `maybeSingle()`; `null` for missing, foreign and deleted ids alike; throws on a query error (as
  `listPositions` does).
- `updatePositionPrice(client, id, input): Promise<UpdatePriceResult>` with
  `UpdatePriceResult = { ok: true } | { ok: false; error: "not_found" | "validation" | "unexpected" }`.
  Updates only `current_price` and `price_date`, filters `id` and `deleted_at is null`, selects
  `id`; zero rows → `not_found`; codes in `VALIDATION_CODES` → `validation`; anything else is logged
  with `logUnexpected` (code and message only) → `unexpected`.

#### 7. Detail page

**File**: `src/pages/dashboard/positions/[id].astro` (new)

**Intent**: FR-011 (full reason with the result) and the FR-006 update path.

**Contract**:
- Gated by the existing `/dashboard` middleware prefix; keeps the `if (!user)` redirect that `new.astro` has.
- A non-uuid `id`, or `getPosition` returning `null`, sets `Astro.response.status = 404` and renders
  "Position not found" with a link back to `/dashboard`. The same output for every not-found
  cause, so it never reveals whether an id exists for another account.
- A failed read renders an error state rather than a 500, as `/dashboard` does.
- GET shows instrument, category badge, buy date, buy price, quantity and broker (`—` when empty),
  the reason with preserved line breaks (`No reason written.` when empty), `PositionResult`, and
  the price form: price field empty, date field today; the current price and date are shown above
  it when set.
- POST: `readPriceForm` → `parsePriceForm(values, position.buy_date)` → `updatePositionPrice`. Success
  redirects to `/dashboard/positions/<id>`. Validation failure re-renders with values and per-field
  errors (status 200); `not_found` renders the 404 state; `validation`/`unexpected` show a form-level
  message, mirroring `SAVE_ERRORS` in `new.astro`.

#### 8. Positions list

**File**: `src/components/positions/PositionsTable.astro`

**Intent**: Show each result in the list and make each position openable.

**Contract**: The instrument cell becomes a link to `/dashboard/positions/<id>`; a new Result
column (after Buy price) renders `PositionResult`. Column order otherwise unchanged.

### Success Criteria:

#### Automated Verification:

- `verify` skill sequence passes (astro sync, lint, astro check, build)
- Existing smoke walk still passes: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- A position with a multi-paragraph reason shows every line break on its detail page
- Setting a price with quantity shows percent and amount; without quantity, percent only — in both the detail page and the list, each with "as of <date>"
- A future price date and a date before the buy date are both rejected with the values kept
- `,` decimals work in the price field
- A second price update replaces the first; the list shows the new result and date
- `/dashboard/positions/not-a-uuid` and a random uuid both show "Position not found" with status 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Smoke proof

### Overview

Extend the smoke walk so CI proves the detail page, the price update and that a second account can
neither read nor reprice someone else's position.

### Changes Required:

#### 1. Smoke walk

**File**: `scripts/smoke.mjs`

**Intent**: Turn S-02's behaviour and privacy expectations into automated checks.

**Contract**: Capture A's position id from the dashboard HTML (`href="/dashboard/positions/<uuid>"`)
right after the first position is recorded, before the no-JS step adds a second one, the same way
`categoryId` is captured. New steps, in walk order:
- A: dashboard shows "No price yet"
- A: detail page shows the reason text and category, and "No price yet"
- A: a future price date is rejected (200, message shown)
- A: a price date before the buy date is rejected (200, message shown)
- A: setting price `60,3` dated today redirects to the detail page (buy price is `50,25`, so the result is +20.00%)
- A: dashboard shows `+20.00%` and `as of`
- A: a random uuid detail page returns 404
- B: A's detail page returns 404 and contains neither the instrument nor the reason
- B: a price POST to A's position returns 404
- A signs in again: the detail page still shows `+20.00%`, proving B's POST changed nothing
- anonymous: A's detail page redirects to `/auth/signin`

The id check (`excludesId`/`check`) generalises to cover the position id as well as the category id.

### Success Criteria:

#### Automated Verification:

- `BASE_URL=http://localhost:4321 npm run smoke` passes against local Supabase
- `verify` skill sequence passes

#### Manual Verification:

- After a deliberate break (temporarily drop the `deleted_at`/id filter or point B's POST at its own position), the relevant smoke step fails — then revert
- A pull request against `master` is opened so the `ci` job runs (the `smoke` job runs only after merge, so the local smoke run is the pre-merge proof)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None: the repo has no test framework, and adding one is out of scope. `positionResult` is pure
  and small enough that the smoke assertion (+20.00%) and the manual quantity check cover it.

### Integration Tests:

- `scripts/smoke.mjs` (Phase 3): detail read, price set, date validation, cross-account read and
  write isolation, anonymous redirect.
- Check-constraint probes and the down-script round trip (Phase 1).

### Manual Testing Steps:

1. Open a back-filled position: "No price yet" on list and detail.
2. Set a price with a past date; check percent, amount (with quantity) and "as of" in both places.
3. Try a future date and a date before the buy date; values stay in the form.
4. Update the price again; the old one is replaced.
5. Open a random uuid and a malformed id; both show the 404 state.

## Performance Considerations

None: one extra pair of columns in an existing single-user query, and one by-id read.

## Migration Notes

- Adds nullable columns only; existing rows become "No price yet". No backfill.
- Shared local Supabase stack with the `recoverable-delete` worktree: apply with
  `npx supabase migration up`, not `db reset`, while both branches are active. After both merge,
  regenerate `src/db/database.types.ts` rather than hand-merging it.
- Human pushes the migration to production (`npx supabase db push`) before this change merges,
  per `context/deployment/deploy-plan.md`. Rollback before any price is entered: the down-script;
  afterwards, code-only rollback (the nullable columns are harmless to old code).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-006, FR-011, NFRs)
- Coordination: `context/changes/position-detail-and-price/change.md`
- Previous slice: `context/archive/2026-09-25-record-first-investment/plan.md`
- Form-page pattern: `src/pages/dashboard/new.astro`
- Service pattern: `src/lib/services/positions.ts`
- Schema: `supabase/migrations/20260929141102_create_diary_core.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Price columns

#### Automated

- [x] 1.1 The migration applies to the local database
- [x] 1.2 Both checks reject bad rows
- [x] 1.3 Down-script round trip succeeds locally
- [x] 1.4 Regenerating database types produces no diff
- [x] 1.5 verify skill sequence passes

#### Manual

- [x] 1.6 Human pushes the migration to production and confirms both columns in Studio

### Phase 2: Detail page and result

#### Automated

- [ ] 2.1 verify skill sequence passes
- [ ] 2.2 Existing smoke walk still passes

#### Manual

- [ ] 2.3 Multi-paragraph reason keeps its line breaks
- [ ] 2.4 Result shows percent and amount with quantity, percent only without, with "as of" date in detail and list
- [ ] 2.5 Future and before-buy price dates rejected with values kept
- [ ] 2.6 Comma decimals work in the price field
- [ ] 2.7 Second price update replaces the first
- [ ] 2.8 Malformed and unknown ids show "Position not found" with status 404

### Phase 3: Smoke proof

#### Automated

- [ ] 3.1 Smoke walk passes against local Supabase
- [ ] 3.2 verify skill sequence passes

#### Manual

- [ ] 3.3 A deliberate break makes the relevant smoke step fail
- [ ] 3.4 Pull request opened so the ci job runs
