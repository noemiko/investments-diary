# Automatic stock prices — Plan brief

## What & Why

Download free US and Polish stock prices when the user clicks **Download prices**, so position results, wallet totals, and future daily observations use those saved quotes without routine manual price entry.

## Starting Point

Prices are currently entered manually. Position results and wallet totals use application services, while daily observations read saved prices directly in SQL. Instruments are free-text labels, and wallets have no currency.

## Desired End State

The user must choose a Yahoo stock/ETF when creating an investment, then save without downloading a quote. A later explicit **Download prices** verifies the selected listing's trading currency/timezone and saves its price. Existing unlinked holdings still support explicit quote lookup and confirmation. Page opening and reloading only display saved data. Results consistently use the selected price, show its source and time, and remain available during provider outages.

## Key Decisions Made

| Decision          | Choice                                                                                           | Source          |
| ----------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| Provider          | Yahoo through pinned `yahoo-finance2@4.0.5`, subject to feasibility gate                         | Research / Plan |
| Price use         | Position results, wallet totals, and future observations                                         | User            |
| Refresh           | Explicit **Download prices** click only; no successful-download age restriction                  | User (revised)  |
| Listing identity  | Required Yahoo selection at creation; quote and currency verification on explicit download       | User (revised)  |
| Currency          | One currency per wallet; USD, PLN or EUR; unset existing wallets become USD; no conversion       | User            |
| Manual correction | Temporary override until a quote’s market time is strictly later than the correction’s save time | User            |
| Provider failure  | Retain valid automatic quote; manual fallback if none exists                                     | User            |
| Existing holdings | Allow reassignment between owned wallets; preserve past observations                             | User            |
| Shared selection  | Database view consumed by application reads and snapshot capture                                 | Plan            |

## Scope

**Included:** listing search, quote caching, valuation integration, wallet denomination, wallet reassignment, source/freshness display, and future snapshot metadata.

**Excluded:** FX conversion, streaming, page-load/reload downloads, automatic retries, unattended downloads, active-page polling, historical quote imports, and rewriting recorded amounts or dates. Unlabelled observations inherit wallet currency by explicit owner decision.

## Architecture / Approach

**Download prices** click → authenticated POST → owned holdings → bounded quote download → persistent cache. Page reads and snapshot capture consume saved values through the shared effective-price view without provider requests.

## Phases at a Glance

| Phase | Deliverable                                  | Main risk                            |
| ----- | -------------------------------------------- | ------------------------------------ |
| 1     | Provider validation and documented contracts | Yahoo access or GPW coverage fails   |
| 2     | Persistence and shared valuation selection   | Ownership or precedence errors       |
| 3     | Bounded download and search services         | Throttling and partial responses     |
| 4     | UI, reassignment, and valuation integration  | Inconsistent results across surfaces |
| 5     | Verification and release preparation         | Migration or deployment differences  |

**Prerequisites:** local Supabase, Node 24, and access to a controlled deployment environment for provider validation.

**Estimated effort:** approximately 5–8 focused sessions, conditional on provider validation.

## Open Risks & Assumptions

- Yahoo is unofficial; free access and freshness are not guaranteed.
- Price age depends on provider delay and when the user last clicked **Download prices**; there is no automatic freshness guarantee.
- Midnight observations use available saved values, potentially old when the user has not downloaded prices recently.
- A failed download retains the previous quote. The existing 15-minute failure cooldown still applies, but never schedules a retry by itself.

## Success Criteria

- Confirmed US/GPW holdings receive automatic prices and consistent results.
- Manual corrections survive equal or older market timestamps.
- Currency boundaries, ownership, and immutable history remain intact.

## References

[Full plan](plan.md), [existing research](research.md), [SDK quote contract](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/modules/quote.ts), [SDK request options](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/docs/README.md).
