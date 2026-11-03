# Dashboard Results and Stock Picking — UX Implementation Plan

## Overview

Two targeted UX improvements from the frame brief (`frame.md`): make "how am I doing" visible at a
glance on `/dashboard` (and the wallet detail page that shares its list), and make picking the stock
on `/dashboard/new` a single, in-place step. The recording view also moves onto the design tokens
the dashboard already uses.

## Current State Analysis

From the frame brief's Hypothesis Investigation and two research passes:

- `/dashboard` (`src/pages/dashboard.astro`) shows a header, the `DownloadPrices` island, then one
  9-column `PositionsTable` mixing open and closed rows (ordered by `buy_date` desc,
  `src/lib/services/positions.ts:82-84`). The Result cell stacks `PositionResult` with the full
  `PriceContext` (up to ~9 lines of provenance, `src/components/market-prices/PriceContext.astro:20-79`).
- Results are percent-only, unstyled by design (`archive/2026-10-15-position-detail-and-price`); the
  sign is the only direction cue.
- A pure, tested per-wallet summary exists: `walletValue()` + `groupByWallet()` +
  `describeWalletResults()` in `src/lib/wallet.ts:31-96`, used by `/dashboard/wallets` and
  `WalletValue.astro`. `PositionListItem` already carries what it needs; `listWallets`
  (`src/lib/services/wallets.ts:34-45`) supplies `starting_value` and `currency`.
- `PositionsTable` is shared by `/dashboard`, `/dashboard/wallets/[id]` (`showWallet={false}`) and
  `/dev/kitchen-sink`. The position detail page already renders the full `PriceContext`.
- `/dashboard/new`: wallet `<select>` first (changing it clears the selection because receipts are
  wallet-bound, `market-selections.ts:57-59`); stock search is a native POST
  (`action=search_listing`) that reloads the page; each result is a separate `select_listing` POST
  that only re-reads the receipt (no provider call, `new.astro:102-119`); save re-validates the
  receipt and a DB trigger validates it again.
- No JSON endpoint serves new-position search: `/dashboard/market-prices/listings/search` is retired
  and always returns 409 (`src/lib/market-data/endpoint.ts:8-11,43`).
- Each search = one Yahoo call + up to 10 receipt inserts; no server-side throttle
  (`market-selections.ts:66-131`).
- `/dashboard/new` and `PositionForm.tsx` / `ConfrontationPanel.tsx` still use the pre-token palette
  (`bg-white/10`, `text-blue-100/*`, `purple-*`), deferred in
  `archive/2026-10-07-ui-tokens-onboarding/charges.md`.

## Desired End State

- `/dashboard` opens with one card per wallet (value, signed change and %, open/realised split,
  "prices as of", excluded count — each in its own currency), then an **Open positions** section and
  a **Closed positions** section. Each row reads: instrument, result (neutral ▲/▼/— icon + signed %
  + date), short price-source label, category, wallet. Only actionable price states show a one-line
  notice. Below `md` the rows render as stacked cards.
- `/dashboard/wallets/[id]` shows the same sectioned list.
- On `/dashboard/new` with JS, searching shows results in place, clicking one shows a
  "Selected: Name · SYMBOL — Change" chip, and no page reloads before Save. Without JS the current
  POST flow still works end to end.
- `/dashboard/new` uses tokens and shared primitives, visually matching the dashboard.

Verify via the `verify` skill, the Vitest suite, Playwright e2e (JS on and off), `npm run smoke`, and
before/after screenshots at desktop and 390px.

### Key Discoveries:

- `refreshPriceFragments` (`src/components/market-prices/client.ts:17-37`) replaces every
  `[data-price-refresh]` element that contains no input/select/textarea/`astro-island`, and throws if
  none remain — the dashboard's single fragment `dashboard-positions` must keep wrapping the
  summary-affected markup and must not wrap the `DownloadPrices` island.
- Smoke `positionIdFor` (`scripts/testing/smoke.mjs:217-225`) parses `<tr>` rows containing
  `>INSTRUMENT<` and the `/delete"` action — the delete control must stay in the same `<tr>`.
- e2e `investment-persists.spec.ts:64-73` expects the row to contain
  "Trading currency is not checked yet" — kept as an actionable notice.
- `describeResult` (`src/lib/result.ts:51-58`) is the single formatter for `PositionResult` and
  `ConfrontationPanel` — the direction cue belongs there.
- Lesson: when touching option colours, use `[&>option]:bg-popover [&>option]:text-popover-foreground`
  (`context/foundation/lessons.md`).

## What We're NOT Doing

- No green/red gain/loss colours or other verdict styling (PRD; reaffirmed in this plan).
- No search-as-you-type, no server-side search throttle, no receipt cleanup job.
- No change to the native no-JS POST contract of `/dashboard/new` (`search_listing`,
  `select_listing`, `save`, field names).
- No new global navigation shell; navigation was ruled out as the driver in the frame brief.
- No change to position detail, wallets index, deleted positions or sign-in views beyond what the
  shared `PositionResult` direction cue implies.
- No sorting/filtering controls, no pagination, no money amounts in position rows (percent-only
  stays for positions; amounts appear only in wallet cards, as on `/dashboard/wallets`).
- No light theme work; no Vercel cloud actions by agents (lessons).

## Implementation Approach

Build bottom-up and keep each phase shippable: shared formatting first (direction cue), then the
dashboard summary, then the list structure, then the recording view. Reuse existing pure functions
(`walletValue`, `describeResult`) rather than adding new calculations. Progressive enhancement for
search: the JSON endpoint wraps the same `searchMarketSelections` service the POST path uses, so
both paths issue identical receipts and Save's validation is unchanged.

## Critical Implementation Details

- **Direction icon is decorative.** Render it `aria-hidden` and keep the existing text
  (`+20.00% as of …`) byte-identical, so row-text contracts in `result-surfaces.test.ts`, smoke and
  e2e keep holding and screen readers still get the sign.
- **Mobile cards duplicate row content.** Hide one markup with `hidden`/`md:` display utilities
  (display:none, out of the accessibility tree) rather than visually-hidden; the `<tr>` stays the
  element tests and smoke target. Any e2e `getByText` that could match both must be scoped to a
  row or the visible element.
- **Client-side selection must still post the receipt.** Selecting a result in JS sets the hidden
  `listing_receipt_id` and `instrument` inputs from the result's `receiptId`/`symbol`; Save stays a
  native POST and the server re-reads the receipt, so a tampered value fails exactly as today.
- **Wallet change still clears the selection** (receipts are wallet-bound); the chip disappears and
  the user is told to search again.

## Phase 1: Wallet summary and neutral direction cue

### Overview

Answer "how am I doing" at the top of `/dashboard` and make the direction of every result scannable
without colour.

### Changes Required:

#### 1. Result direction

**File**: `src/lib/result.ts`, `src/lib/result.test.ts`

**Intent**: Expose a neutral direction so every result surface can show an up/down/flat cue.

**Contract**: `describeResult` returns `{ percent, asOf, direction: "up" | "down" | "flat" }` (flat
when the exact percent is zero); existing `percent`/`asOf` strings unchanged.

#### 2. Result rendering

**File**: `src/components/positions/PositionResult.astro`, `src/components/positions/ConfrontationPanel.tsx`

**Intent**: Show a lucide icon (`TrendingUp` / `TrendingDown` / `Minus`) before the percent,
`aria-hidden`, in the foreground colour; slightly larger tabular figures for the percent.

**Contract**: Visible text unchanged; new `data-result-direction` attribute on the result wrapper for
tests.

#### 3. Wallet summary cards

**File**: `src/components/wallets/WalletSummaryCards.astro` (new), `src/pages/dashboard.astro`

**Intent**: Read `listWallets` alongside `listPositions`, group positions with `groupByWallet`, and
render one compact card per wallet with `walletValue` output: name + currency, current value,
signed change and %, open vs realised change, `describeWalletResults` freshness line, not-counted
count; card links to the wallet page. Never sum across wallets.

**Contract**: Cards sit inside `data-price-refresh="dashboard-positions"` (so Download prices
refreshes them) and outside the `DownloadPrices` island. A failed `listWallets` read falls back to
no cards plus the list (report via `reportUnexpected`), never a 500. Wallets with no positions
still get a card. Empty diary keeps the existing empty state without cards.

### Success Criteria:

#### Automated Verification:

- `result.test.ts` covers up, down, flat and null for open and closed results
- `result-surfaces.test.ts` asserts one card per wallet with its currency and that existing row text is unchanged
- `npx astro sync && npm run lint && npx astro check && npm test` pass

#### Manual Verification:

- With two wallets in different currencies, each card shows its own currency and no combined total appears
- Download prices refreshes card values without a reload

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Sectioned, compact positions list

### Overview

Split the list into open and closed sections, slim each row to the essentials plus actionable
alerts, and render cards below `md` — on both `/dashboard` and `/dashboard/wallets/[id]`.

### Changes Required:

#### 1. Compact price context

**File**: `src/components/market-prices/PriceContext.astro`, `src/components/market-prices/price-context.test.ts`

**Intent**: Add a `variant="compact"` that renders one short source label (e.g. "Downloaded",
"Manual", "Manual correction", "Sale") and, only for actionable states, one notice line: currency
not checked yet, currency mismatch, latest download failed, download in progress, no price. The
default (full) variant stays for the detail page.

**Contract**: `variant?: "full" | "compact"` (default `"full"`); compact keeps the exact sentence
"Trading currency is not checked yet" as the start of its notice.

#### 2. Sectioned table with mobile cards

**File**: `src/components/positions/PositionsTable.astro`, `src/components/positions/PositionsSection.astro` (new, if splitting helps)

**Intent**: Partition rows into "Open positions" (no `sell_date`) and "Closed positions"
(`sell_date` set), each keeping the service order and showing a count; omit a section with no rows.
Columns: Instrument (+ Closed badge in closed section), Result, Category, Wallet (when
`showWallet`), Buy date, Buy price, Quantity, Broker, actions — Result moves next to Instrument.
Below `md`, render each row as a card (instrument link, result, compact context, category, wallet,
delete control); the table is `hidden md:table`.

**Contract**: Each table row still contains the instrument link, its cells for buy price / quantity
/ buy date, and the delete form in the same `<tr>`. Props unchanged (`positions`, `showWallet`).

#### 3. Page placement

**File**: `src/pages/dashboard.astro`, `src/pages/dashboard/wallets/[id].astro`, `src/pages/dev/kitchen-sink.astro`

**Intent**: Place `DownloadPrices` beside the "Open positions" heading area (outside the refresh
fragment), and add kitchen-sink states: only open, only closed, mixed, alerts present, 390px.

**Contract**: Exactly one `data-price-refresh="dashboard-positions"` on the dashboard, containing
the cards and both sections, containing no island or form input other than the delete forms'
buttons.

#### 4. Test contracts

**File**: `src/components/positions/result-surfaces.test.ts`, `tests/e2e/investment-persists.spec.ts`, `tests/e2e/market-price-controls.spec.ts`, `tests/e2e/wallet-dashboard.spec.ts`, `scripts/testing/smoke.mjs`

**Intent**: Add assertions for section headings, section membership (open row not in closed
section and vice versa) and the compact notice; update only assertions whose markup intentionally
changed, scoping text lookups to table rows where card duplicates could match.

**Contract**: Smoke still finds positions via `positionIdFor`; no assertion is deleted without a
replacement covering the same behaviour.

### Success Criteria:

#### Automated Verification:

- `price-context.test.ts` covers the compact variant for every source and each actionable state
- `result-surfaces.test.ts` asserts open/closed sections on the dashboard and wallet detail
- `npx astro sync && npm run lint && npx astro check && npm test` pass
- `npx playwright test` passes
- `npm run smoke` passes against `npm run dev` with local Supabase

#### Manual Verification:

- At 390px the dashboard shows stacked cards with result and category visible, no horizontal page scroll
- Wallet detail page shows the same sectioned list without the Wallet column
- A position with a failed download or unchecked currency shows its one-line notice; a healthy one shows none

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to the next phase.

---

## Phase 3: In-place stock search

### Overview

With JS, search and select the stock without page reloads; without JS, keep today's POST flow.

### Changes Required:

#### 1. JSON search endpoint

**File**: `src/pages/dashboard/new/search.ts` (new), `src/lib/market-data/new-search-endpoint.ts` (new) + test

**Intent**: A POST-only JSON endpoint for new-investment search that mirrors the checks of
`marketPriceEndpoint` (405 non-POST, 401 anonymous, 403 Origin / cross-site, JSON content type,
≤4096-byte body) and calls `searchMarketSelections` with the request signal.

**Contract**: Request `{ walletId: uuid, query: string(2..100) }` (strict). Response
`{ ok: true, choices: MarketSelectionChoice[] }` or `{ ok: false, reason }` with the same reason →
status mapping as the existing endpoint (`invalid_request` 400, `not_found` 404, provider failure
503). Unexpected errors are reported via `reportUnexpected` and return 503.

#### 2. Progressive enhancement in the form

**File**: `src/components/positions/PositionForm.tsx`, `src/components/positions/StockPicker.tsx` (new, if extraction helps)

**Intent**: When hydrated, intercept the "Search listings" button and Enter in the query field: fetch
the endpoint (abort any in-flight request), show a busy state and results in place; clicking a
result sets hidden `listing_receipt_id` / `instrument` and shows a "Selected: Name · SYMBOL" chip
with a **Change** button that clears it and refocuses the query. Errors show the same messages the
POST path uses. Before hydration and without JS, buttons keep their native `search_listing` /
`select_listing` submits.

**Contract**: Field and button names unchanged; the chip keeps `role="status"` and the text
"Selected: <name> · <symbol>"; changing wallet clears the chip and results.

#### 3. Tests

**File**: `src/components/positions/new-position.test.ts`, `tests/e2e/investment-persists.spec.ts`

**Intent**: Unit-test the endpoint (auth, Origin, body validation, service mapping, never calls the
provider on invalid input). e2e: with JS, mock the search response via Playwright route interception
and assert no navigation happens between search, select and Save; the no-JS run keeps the POST path.

**Contract**: Existing `new-position.test.ts` POST assertions remain unchanged.

### Success Criteria:

#### Automated Verification:

- Endpoint unit tests cover 405, 401, 403, 400 (body, length, content type), 404, 503 and success
- `new-position.test.ts` existing POST-flow tests pass unchanged
- `npx playwright test` passes with JS on and off
- `npx astro sync && npm run lint && npx astro check && npm test` pass

#### Manual Verification:

- With JS, search → select → save a real AAPL investment against local Supabase with no page reload before Save
- With JS disabled, the same entry still saves via the POST flow
- Changing the wallet after selecting clears the chip and explains why

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Recording view on tokens, and visual gate

### Overview

Move `/dashboard/new` onto the token system and shared primitives so it matches the dashboard, then
gate the whole change with screenshots.

### Changes Required:

#### 1. View and form styling

**File**: `src/pages/dashboard/new.astro`, `src/components/positions/PositionForm.tsx`, `src/components/positions/ConfrontationPanel.tsx`, `src/components/auth/FormField.tsx` (only if shared styling requires it)

**Intent**: Replace raw palette classes (`bg-white/10`, `text-blue-100/*`, `purple-*`, gradient
heading) with tokens (`bg-card`, `text-muted-foreground`, `text-gradient-heading`, `border-input`,
`ring-ring`) and wrap the page in `Card`, with the same header link back to the dashboard as other
views. Selects use `[&>option]:bg-popover [&>option]:text-popover-foreground` (lessons).

**Contract**: No behavioural or copy change; `SignInForm` keeps working if `FormField` is touched.

#### 2. Visual gate

**File**: `context/changes/ui-ux-redesign/screens/` (new)

**Intent**: Capture before/after screenshots of `/dashboard`, `/dashboard/wallets/[id]` and
`/dashboard/new` (empty, search results, selected, validation error) at desktop and 390px against
`npm run dev` with local Supabase.

**Contract**: Screens referenced from a short `screens/README.md` listing each state.

### Success Criteria:

#### Automated Verification:

- No `blue-100`, `purple-` or `bg-white/` classes remain in `new.astro`, `PositionForm.tsx` or `ConfrontationPanel.tsx` (grep)
- `npx astro sync && npm run lint && npx astro check && npm test` pass
- `npx playwright test` passes
- `npm run smoke` passes

#### Manual Verification:

- `/dashboard/new` and `/dashboard` look like one app (screenshots side by side)
- Keyboard pass on `/dashboard/new`: visible focus on every control, Enter in the query searches, result and Change buttons reachable
- Select popups readable in Firefox

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before archiving.

---

## Testing Strategy

### Unit Tests:

- `describeResult` direction for up/down/flat/null, open and closed
- `PriceContext` compact variant per source and actionable state
- New search endpoint: every rejection path and the success mapping, provider never called on rejection
- Rendered surfaces: wallet cards, sections, compact notices, unchanged row text

### Integration Tests:

- Playwright: record an investment with JS (in-place search, mocked response) and without JS (POST)
- Playwright: Download prices refreshes cards and sections
- Smoke: unchanged flows still pass

### Manual Testing Steps:

1. Two wallets (USD, PLN), open and closed positions: check cards, sections, direction icons
2. Break a quote (failed download) and confirm the one-line notice
3. Record a buy on a 390px viewport with JS on; repeat with JS off
4. Keyboard-only pass on both views

## Performance Considerations

The dashboard adds one `listWallets` read (small, indexed) next to `listPositions`; summaries are
pure in-memory calculations. Search cost is unchanged: one Yahoo call per explicit search, never per
keystroke.

## Migration Notes

No database migration. UI-only plus one new read-only-to-provider endpoint.

## References

- Frame brief: `context/changes/ui-ux-redesign/frame.md`
- Wallet summary logic: `src/lib/wallet.ts:31-96`, `src/pages/dashboard/wallets/index.astro:25-34`
- Search service: `src/lib/services/market-selections.ts:66-131`
- Endpoint pattern: `src/lib/market-data/endpoint.ts`
- Prior UI change: `context/archive/2026-10-07-ui-tokens-onboarding/charges.md`
- Verdict-styling decision: `context/archive/2026-10-15-position-detail-and-price/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wallet summary and neutral direction cue

#### Automated

- [x] 1.1 `result.test.ts` covers up, down, flat and null for open and closed results — a7b985e
- [x] 1.2 `result-surfaces.test.ts` asserts one card per wallet with its currency and that existing row text is unchanged — a7b985e
- [x] 1.3 `npx astro sync && npm run lint && npx astro check && npm test` pass — a7b985e

#### Manual

- [x] 1.4 With two wallets in different currencies, each card shows its own currency and no combined total appears — a7b985e
- [x] 1.5 Download prices refreshes card values without a reload — a7b985e

### Phase 2: Sectioned, compact positions list

#### Automated

- [x] 2.1 `price-context.test.ts` covers the compact variant for every source and each actionable state — ccc250f
- [x] 2.2 `result-surfaces.test.ts` asserts open/closed sections on the dashboard and wallet detail — ccc250f
- [x] 2.3 `npx astro sync && npm run lint && npx astro check && npm test` pass — ccc250f
- [x] 2.4 `npx playwright test` passes — ccc250f
- [x] 2.5 `npm run smoke` passes against `npm run dev` with local Supabase — ccc250f

#### Manual

- [x] 2.6 At 390px the dashboard shows stacked cards with result and category visible, no horizontal page scroll — ccc250f
- [x] 2.7 Wallet detail page shows the same sectioned list without the Wallet column — ccc250f
- [x] 2.8 A position with a failed download or unchecked currency shows its one-line notice; a healthy one shows none — ccc250f

### Phase 3: In-place stock search

#### Automated

- [x] 3.1 Endpoint unit tests cover 405, 401, 403, 400 (body, length, content type), 404, 503 and success — 4f72ce4
- [x] 3.2 `new-position.test.ts` existing POST-flow tests pass unchanged — 4f72ce4
- [x] 3.3 `npx playwright test` passes with JS on and off — 4f72ce4
- [x] 3.4 `npx astro sync && npm run lint && npx astro check && npm test` pass — 4f72ce4

#### Manual

- [x] 3.5 With JS, search → select → save a real AAPL investment against local Supabase with no page reload before Save — 4f72ce4
- [x] 3.6 With JS disabled, the same entry still saves via the POST flow — 4f72ce4
- [x] 3.7 Changing the wallet after selecting clears the chip and explains why — 4f72ce4

### Phase 4: Recording view on tokens, and visual gate

#### Automated

- [x] 4.1 No `blue-100`, `purple-` or `bg-white/` classes remain in `new.astro`, `PositionForm.tsx` or `ConfrontationPanel.tsx` (grep)
- [x] 4.2 `npx astro sync && npm run lint && npx astro check && npm test` pass
- [x] 4.3 `npx playwright test` passes
- [x] 4.4 `npm run smoke` passes

#### Manual

- [x] 4.5 `/dashboard/new` and `/dashboard` look like one app (screenshots side by side)
- [x] 4.6 Keyboard pass on `/dashboard/new`: visible focus on every control, Enter in the query searches, result and Change buttons reachable
- [x] 4.7 Select popups readable in Firefox
