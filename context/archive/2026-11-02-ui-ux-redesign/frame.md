# Frame Brief: UI review and redesign

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

"review ui of the application. design new UI with UX best practices" — the author is
dissatisfied with the current UI; the request names no specific screen or symptom.

## Initial Framing (preserved)

- **User's stated cause or approach**: the UI does not follow UX best practices.
- **User's proposed direction**: review the whole UI and design a new one.
- **Pre-dispatch narrowing**: the worst moments are **scanning positions** (`/dashboard`) and
  **recording a buy** (`/dashboard/new`); the discomfort is **"hard to find things"**; it is
  **one or two specific spots**, not a general feeling across the app.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Cross-view navigation** — no shared app shell; each view hand-builds its own links, so
   destinations are hard to discover.
2. **Dashboard information hierarchy** — the positions table buries the signal (results)
   under columns and price-provenance text.
3. **Recording flow / stock picking** — the order and mechanics of the new-investment form
   make the stock selection hard to find or complete.
4. **Split visual language** — `/dashboard/new` still uses the pre-token palette, so views
   feel like different apps.
5. **App-wide lack of UX best practices** — every view needs redesigning.  ← initial framing

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Navigation | No layout shell: `src/layouts/Layout.astro` renders a bare `<slot />`; `Topbar.astro` is used only on the landing page. Dashboard links to Wallets / Deleted are muted text links (`src/pages/dashboard.astro` header); `/dashboard/new` and position detail offer only a bottom "Back" link. Real, but the author did not pick "other places" as hard to find. | WEAK |
| 2. Dashboard hierarchy | `PositionsTable.astro` has 9 columns; the Result cell stacks `PositionResult` (percent + "as of") with `PriceContext.astro`, which can emit up to ~9 lines (source · currency, symbol · exchange, pending-selection notes, override rules, manual-entry line, market time / state / provider delay, failure, refreshing, cooldown). Results are percent-only, unstyled (`PositionResult.astro`). Open and closed rows are interleaved, no grouping or ordering. `DownloadPrices` adds a button, explanation, status and per-symbol list above the table. Author picked **"How I'm doing"** as what they cannot find. | STRONG |
| 3. Recording / stock picking | `PositionForm.tsx`: wallet `<select>` comes first and changing it clears the selected listing; the stock fieldset needs typing → **Search listings** (full-page native POST, `action=search_listing`) → a per-result **Select SYMBOL** submit (second POST) → a separate "Selected:" status block, plus two paragraphs of download/currency copy. Form is a single `max-w-md` column. Author picked **"Picking the stock"**. | STRONG |
| 4. Split visual language | `new.astro` uses `bg-white/10`, `text-blue-100/*`, `purple-*`; dashboard uses tokens. Deferred explicitly in `archive/2026-10-07-ui-tokens-onboarding/charges.md` → Deferred. Real inconsistency, but the author did not pick "looks unpolished", and it does not explain "hard to find". | WEAK |
| 5. App-wide redesign | Author narrowed to two views and "one or two specific spots"; wallets, position detail, deleted were not named. | NONE |

## Narrowing Signals

- "One or two specific spots" rules out an app-wide problem (dimension 5).
- On the dashboard the author cannot find **how they are doing**, not a specific position and
  not other destinations — rules in dimension 2, rules out dimension 1 as the driver.
- On the recording screen the hard part is **picking the stock**, not the confrontation panel
  and not required-vs-optional fields — narrows dimension 3 to the stock-selection sub-flow.

## Cross-System Convention

Earlier changes set constraints the plan must respect or explicitly revisit with the owner:

- **No verdict styling.** Gain/loss colours were rejected on purpose ("the sign carries the
  direction; the PRD keeps results free of verdicts" —
  `archive/2026-10-15-position-detail-and-price/plan-brief.md`, *Verdict styling*;
  repeated for the confrontation panel in `ConfrontationPanel.tsx`). Making results easier to
  find through hierarchy is compatible with that; colouring them is an owner decision, not a
  UX default.
- **Percent-only results** by the author's decision on 2026-10-15
  (`archive/2026-10-15-position-detail-and-price/change.md`).
- **Native POST search/select** was chosen deliberately so the form works without JS and
  saves validate a server-issued receipt
  (`archive/2026-10-29-automatic-stock-prices/download-api.md`, `plan.md` §Phase 4). Wallet
  first exists because a listing must match the wallet's currency (FR-015). Any smoother
  picker must keep the receipt validation and the no-JS path.
- **Visible staleness is a requirement** (FR-006, NFR "every displayed result states the date
  of the price"). Price provenance can move, not disappear.
- The usual convention for "where do I stand" is a summary above the list plus a scannable
  result column; the leading hypothesis matches it.

## Reframed Problem Statement

> **The actual problem to plan around is**: on the dashboard the author cannot see at a
> glance how their positions are doing, because results are buried under price-provenance
> text in a wide table; and on the new-investment form, selecting the stock takes a
> multi-step, page-reloading search whose state is hard to follow.

This is two targeted UX problems in two views, not an app-wide redesign. Fixing them
addresses what the author actually reported; a whole-app redesign would spend most of its
effort on views that work acceptably (wallets, detail, deleted) and would risk undoing
deliberate decisions (no verdict colours, native POST, visible staleness).
Navigation (1) and the leftover palette on `/dashboard/new` (4) are real but secondary; the
plan may fold the palette into the recording-view work, since that view is touched anyway.

## Confidence

**HIGH** — strong code evidence for both dimensions, two decisive narrowing answers, and
the reframe fits prior project decisions rather than fighting them.

## What Changes for /10x-plan

Plan two scoped improvements — dashboard result visibility and the stock-selection
sub-flow of `/dashboard/new` — within the constraints listed above, rather than a full
redesign. Questions about verdict colours or changing the native-POST search are owner
decisions to raise in planning, not defaults.

## References

- Source files: `src/pages/dashboard.astro`, `src/components/positions/PositionsTable.astro`,
  `src/components/positions/PositionResult.astro`, `src/components/market-prices/PriceContext.astro`,
  `src/components/market-prices/DownloadPrices.tsx`, `src/pages/dashboard/new.astro`,
  `src/components/positions/PositionForm.tsx`, `src/layouts/Layout.astro`, `src/components/Topbar.astro`
- Prior decisions: `context/archive/2026-10-07-ui-tokens-onboarding/charges.md`,
  `context/archive/2026-10-15-position-detail-and-price/plan-brief.md`,
  `context/archive/2026-10-29-automatic-stock-prices/download-api.md`
- Related research: none yet
- Investigation: done inline (small surface); no sub-agent tasks
