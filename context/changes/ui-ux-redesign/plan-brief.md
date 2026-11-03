# Dashboard Results and Stock Picking — Plan Brief

> Full plan: `context/changes/ui-ux-redesign/plan.md`
> Frame brief: `context/changes/ui-ux-redesign/frame.md`

## What & Why

> **The actual problem to plan around is**: on the dashboard the author cannot see at a glance how
> their positions are doing, because results are buried under price-provenance text in a wide
> table; and on the new-investment form, selecting the stock takes a multi-step, page-reloading
> search whose state is hard to follow.

The request started as "redesign the whole UI"; framing narrowed it to these two spots.

## Starting Point

`/dashboard` shows one mixed 9-column table whose Result cell carries up to ~9 lines of price notes;
there is no overall summary. `/dashboard/new` needs two full-page POSTs (search, then select) before
the stock is chosen, and still uses the pre-token purple palette.

## Desired End State

The dashboard opens with one card per wallet (value, change, freshness — each in its own currency),
then **Open** and **Closed** sections whose rows show the result with a neutral ▲/▼/— cue, a short
source label and only actionable price alerts; phones get stacked cards. Recording a buy with JS
searches and selects in place with a clear "Selected · Change" chip; without JS it works as today.
Both views share one visual language.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Two views (dashboard results, stock picking), not app-wide | Author located the pain in two spots | Frame |
| Summary | Per-wallet cards via `walletValue()` | Reuses tested logic and never mixes currencies (FR-015) | Plan |
| Gain/loss | Neutral icon, no colours | Faster scanning while keeping the PRD's no-verdict rule | Plan |
| Row detail | Compact source label + actionable alerts only | Keeps staleness visible (FR-006) and full detail stays on the position page | Plan |
| Grouping | Open section, then Closed section | Separates current standing from final outcomes, no JS needed | Plan |
| Stock pick | In-place search via new JSON endpoint; native POST kept | Removes both reloads without weakening receipt validation | Plan |
| Shared table | Wallet detail page changes too | One consistent list, no variant to maintain | Plan |
| Mobile | Stacked cards below `md` | Result and category readable on a phone | Plan |
| Recording styling | Migrate `/dashboard/new` fully to tokens | View is reworked anyway; closes the deferred charge | Plan |

## Scope

**In scope:**
- Wallet summary cards and direction cue (`describeResult`, `PositionResult`, `ConfrontationPanel`)
- Sectioned, compact `PositionsTable` with mobile cards on dashboard and wallet detail
- `POST /dashboard/new/search` JSON endpoint and progressive enhancement of the stock picker
- Token migration of `/dashboard/new`; before/after screenshots

**Out of scope:**
- Gain/loss colours, search-as-you-type, search throttle, receipt cleanup
- Global navigation shell, sorting/filters, pagination, amounts in position rows
- Other views (detail, wallets index, deleted, sign-in) beyond the shared result cue; light theme

## Architecture / Approach

Pure functions already hold the logic (`walletValue`, `describeResult`); the work is presentation
plus one endpoint. The endpoint wraps the same `searchMarketSelections` service as the POST path, so
both paths issue identical wallet-bound receipts, and Save (native POST) plus the DB trigger keep
validating them. Download prices keeps refreshing via the single `data-price-refresh` fragment,
which now also wraps the wallet cards.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Wallet summary & direction cue | Cards on top of the dashboard; ▲/▼/— on every result | Cards inside the refresh fragment must not wrap the island |
| 2. Sectioned compact list | Open/Closed sections, compact rows + alerts, mobile cards | Many exact-text test contracts (smoke, e2e, surfaces) |
| 3. In-place stock search | No reloads before Save with JS; POST path intact | Two code paths drifting apart |
| 4. Tokens & visual gate | `/dashboard/new` matches the dashboard; screenshots | Select option colours (lessons.md) |

**Prerequisites:** local Supabase (`npx supabase start`), `.env` on the local stack, Playwright set up.
**Estimated effort:** ~4 sessions, one per phase.

## Open Risks & Assumptions

- Duplicate markup (table + mobile cards) can make unscoped e2e text lookups ambiguous; tests are scoped to rows.
- Showing money amounts in wallet cards on the dashboard assumes the percent-only decision covers position rows only (as on `/dashboard/wallets` today).
- Yahoo search stays unthrottled; acceptable while search fires only on explicit submit.

## Success Criteria (Summary)

- Opening the dashboard answers "how am I doing" per wallet without scanning rows.
- A buy can be recorded with the stock chosen in one in-place step, with and without JS.
- Both views pass the full `verify` bar and look like one app at desktop and phone width.
