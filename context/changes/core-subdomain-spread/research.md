---
date: 2026-11-06T13:09:05Z
researcher: Codex
git_commit: b111cc730095ff6b8cea9012a64e902c692ccc27
branch: redirect-user
repository: investments-diary
topic: "Core subdomain spread across application layers"
tags: [research, codebase, core-domain, architecture]
status: complete
last_updated: 2026-11-06
last_updated_by: Codex
---

# Research: Core subdomain spread across application layers

## Research question and scope

How deeply is the Core subdomain defined in `context/domain/01-domain-distillation.md` spread across the current implementation?

The supplied classification defines Core as reasoning records (position, purchase facts, broker label, reason, category and its lifecycle, reason lock, delete/restore) and reflection (confrontation, dated result interpretation, open/closed outcome and whole-position close). Wallets, stock selection and valuation remain Supporting for this investigation (`context/domain/01-domain-distillation.md:173–178`). A dependency on those concepts does not reclassify them as Core.

Evidence is the local revision above. The supplied domain document was untracked at inspection; its classification is the scope input, and implementation conclusions below were checked against source. Repository-relative anchors avoid implying that uncommitted documentation is available in a remote commit.

## Summary

**Core is vertically pervasive and only partially encapsulated.** It participates in client UI, server pages, input validation, application services, shared types and persistence. These are substantive rules, not merely repeated field names: the client validates reasoning input, the page decides whether reflection blocks a save, the service controls close transitions, and SQL enforces ownership, purchase constraints and sale shape (`src/components/positions/PositionForm.tsx:195`, `src/pages/dashboard/new.astro:119`, `src/pages/dashboard/new.astro:178`, `src/lib/services/positions.ts:302`, `supabase/migrations/20260929141102_create_diary_core.sql:27`, `supabase/migrations/20261028120000_close_position.sql:5`).

**There are useful local seams, but no cohesive Core boundary in the inspected paths.** `confrontationState` and `positionResult` are pure functions. Their inputs come from database-derived shared types; the position service handles Core records alongside Supporting prices, receipts and wallet moves (`src/lib/confrontation.ts:17`, `src/lib/result.ts:27`, `src/types.ts:1`, `src/lib/services/positions.ts:10`, `src/lib/services/positions.ts:138`, `src/lib/services/positions.ts:336`).

**Spread matters most where ownership of a rule is incomplete.** Reason locking is not enforced by the inspected migration set; first-close protection is conditional in the service rather than a database transition rule; confrontation is advisory in the save path. These are distinct findings, not proof that layered code is inherently defective (`supabase/migrations/20260929141102_create_diary_core.sql:4`, `supabase/migrations/20261030122155_effective_snapshots_and_wallet_moves.sql:61`, `src/lib/services/positions.ts:311`, `src/pages/dashboard/new.astro:178`).

## Detailed findings

### UI and server pages participate in Core policy

`PositionForm` implements local rules for purchase price/quantity, future buy dates, category choice, reason length and broker label length. It invokes `confrontationState` from current form state, so reflection is computed in the client island as well as its server render (`src/components/positions/PositionForm.tsx:195–237`).

The page combines receipt verification, canonical instrument selection, Core parsing and position creation in one branch (`src/pages/dashboard/new.astro:101–123`). The save can redirect before the later confrontation-history load. That load maps failure to `null`, expressly allowing saving to continue (`src/pages/dashboard/new.astro:178–185`). This is an application workflow choice, not an invariant enforced by the pure confrontation function.

The detail page rejects price/close submissions for a closed position, parses a whole-position close and calls the service. The same page also orchestrates Supporting manual prices and wallet selection (`src/pages/dashboard/positions/[id].astro:66–110`). Thin delete/restore endpoints contrast with this heavier page orchestration (`src/pages/dashboard/positions/[id]/delete.ts:7–26`, `src/pages/dashboard/positions/[id]/restore.ts:7–26`).

Rendering also interprets domain state: the table partitions by `sell_date`; the reflection panel displays reason absence, closed state and dated results (`src/components/positions/PositionsTable.astro:12–19`, `src/components/positions/ConfrontationPanel.tsx:54–79`). The panel additionally interprets Supporting valuation sources and failed-download state, and imports market-price timestamp formatting (`src/components/positions/ConfrontationPanel.tsx:9`, `src/components/positions/ConfrontationPanel.tsx:82–105`).

### Input validation contains business rules and form concerns

The server parser combines transport details with business constraints: positive purchase price, optional positive quantity, a non-future calendar date, a category id or new category name, optional prose, wallet id and listing receipt (`src/lib/validation/position.ts:23–110`). Client and server therefore overlap in validation intent; they are not identical implementations, since the server additionally validates calendar dates and identifiers.

Closing validation requires a sale date between purchase and today and a whole-position acknowledgement. It deliberately removes the acknowledgement when producing `ClosePositionInput` (`src/lib/validation/close-position.ts:26–46`). The service receives an already parsed input rather than re-enforcing the acknowledgement itself (`src/lib/services/positions.ts:302–310`). This distinguishes a form safeguard from a persistence guarantee.

### Pure functions provide a partial domain seam

`confrontationState` resolves a selected category or a case-insensitive typed name to matching prior positions. Ownership, deletion exclusion and ordering are preconditions supplied by the read service, not responsibilities of this function (`src/lib/confrontation.ts:14–39`, `src/lib/services/positions.ts:99–113`). Category-name matching also exists in the category creation service; the function's comment explicitly requires agreement (`src/lib/confrontation.ts:30`, `src/lib/services/positions.ts:211–216`).

`positionResult` handles sale-versus-open price selection and exact arithmetic, including an absent quantity. `describeResult` shares dated wording across React and Astro, so calculation and presentation semantics share a module (`src/lib/result.ts:27–40`, `src/lib/result.ts:62–69`, `src/components/positions/PositionResult.astro:3–8`). Supporting wallet valuation consumes this Core-classified result helper (`src/lib/wallet.ts:3`, `src/lib/wallet.ts:45`). This is reuse, not evidence of numerical drift.

### Application services mix Core operations with Supporting contracts

`positions.ts` combines category reads/creation, position reads/creation, delete/restore and closing with manual price updates and wallet movement. It is a Supabase application/persistence service rather than an isolated behavioral position model (`src/lib/services/positions.ts:63`, `src/lib/services/positions.ts:138`, `src/lib/services/positions.ts:190`, `src/lib/services/positions.ts:219`, `src/lib/services/positions.ts:302`, `src/lib/services/positions.ts:336`).

Creation validates an owner/wallet-bound market receipt before resolving a category and inserting reasoning. A newly created category may remain when insertion fails; the service explicitly accepts that boundary (`src/lib/services/positions.ts:243–291`). This does not establish a transaction-wide aggregate containing the receipt, category and position.

List, detail and confrontation reads consume `position_effective_prices` and `composeEffectivePrice`. The latter replaces open-position price/date with the selected effective values while retaining manual facts in valuation context (`src/lib/services/positions.ts:74–134`, `src/lib/services/effective-price.ts:93–95`, `src/lib/services/effective-price.ts:133–141`). Reflection thus depends on Supporting valuation policy through a read-model adapter rather than calling Yahoo directly.

### Shared types carry database and cross-subdomain structure

`ReasonCategory`, position read models and creation inputs are derived from generated database rows. `PositionListItem` includes wallet identity/name and optional valuation; `ConfrontationPosition` includes valuation context; `NewPositionInput` requires wallet and receipt fields (`src/types.ts:1–66`). They are practical shared DTOs, not persistence-independent Core entities.

The typed database API makes the receipt required for insertion and prevents directly supplying the target (`src/db/api.types.ts:16–21`). Consequently moving a pure function to a Core folder would not by itself remove database-shaped and Supporting contracts from its surrounding workflow.

### Persistence owns substantive Core rules and cross-subdomain composition

The initial schema enforces category naming and active case-insensitive owner uniqueness, positive purchase values, optional reason length, category ownership and owner RLS (`supabase/migrations/20260929141102_create_diary_core.sql:12–66`). Sale constraints enforce a complete pair, nonnegative price and sale date on/after purchase (`supabase/migrations/20261028120000_close_position.sql:5–7`). These rules execute below TypeScript services.

The same position record requires an owner-scoped wallet and a stock target. The selection trigger validates the receipt against wallet and owner, derives instrument/target and prevents saved target/receipt changes (`supabase/migrations/20261019112848_create_wallets.sql:54`, `supabase/migrations/20261102120000_require_position_stock_selection.sql:50`, `supabase/migrations/20261102080240_validate_selection_without_update_privilege.sql:7–26`). Core recording is therefore structurally dependent on Supporting membership and selection.

The effective-price view composes position, wallet and cached quote facts and selects outcome inputs (`supabase/migrations/20261030110418_market_price_persistence.sql:210–244`). Supporting observation capture independently interprets Core purchase/quantity/sale facts in SQL and excludes deleted records (`supabase/migrations/20261030122155_effective_snapshots_and_wallet_moves.sql:18–29`). This is a maintenance seam across SQL and TypeScript, not a demonstrated arithmetic disagreement.

### Enforcement gaps rechecked against current source

- **Original reasoning:** the first migration defers the lock; the later column grant permits `reason_text` updates. Searching the migration set for reason-lock timestamps and trigger definitions found selection/listing/manual-time guards, but no age-based reason guard. The latest Core grants preserve column-limited position updates (`supabase/migrations/20260929141102_create_diary_core.sql:4`, `supabase/migrations/20261030122155_effective_snapshots_and_wallet_moves.sql:58–62`, `supabase/migrations/20261102150000_grant_core_table_access.sql:6–9`). This supports the supplied map's lock gap for the repository migration path; hosted schema was not inspected.
- **Closing:** the service conditions the write on an active open row; SQL validates sale shape without forbidding replacement of a complete pair, and sale-column updates remain granted (`src/lib/services/positions.ts:310–315`, `supabase/migrations/20261028120000_close_position.sql:5–7`, `supabase/migrations/20261030122155_effective_snapshots_and_wallet_moves.sql:61`). The service safeguard is not a universal database transition guarantee.
- **Category lifecycle and factual correction:** the inspected production service provides category list/find/create and position price/delete/restore/close/move operations. It does not provide category rename/retirement or purchase/reason correction operations; historical category projections retrieve names without retirement state (`src/lib/services/positions.ts:63–70`, `src/lib/services/positions.ts:125`, `src/lib/services/positions.ts:138–348`). This is a bounded application-workflow finding; owner database updates and retirement storage do exist.
- **Recoverable deletion:** app writes toggle `deleted_at`; explicit ordinary table grants omit DELETE. Owner account deletion can still cascade, so this is not an unconditional physical-preservation promise (`src/lib/services/positions.ts:190–208`, `supabase/migrations/20261102150000_grant_core_table_access.sql:7–9`, `supabase/migrations/20260929141102_create_diary_core.sql:29`).

## Architecture insights and planning handoff

The observed structure is a layered application with distributed domain rules and shared data contracts. The most concentrated reusable policies are confrontation selection and result calculation; the most consequential cross-layer seams are recording prerequisites, lifecycle enforcement and valuation-backed reflection. Folder placement alone would not change these contracts.

A future plan can reuse the established seams: pure reflection/result functions; parsed command inputs; conditional service writes; database constraints and grants; effective-price read composition. It must separately decide where authority for reasoning edits, category evolution and close transitions belongs. This research does not select a refactor, authorize implementation or assume separate services are needed.

## Historical context and related research

The confrontation brief explicitly accepted an ungated no-JavaScript save and preloaded author history (`context/archive/2026-10-16-reason-confrontation/plan-brief.md:34`, `context/archive/2026-10-16-reason-confrontation/plan-brief.md:80–82`). **Supported currently:** the save branch remains ungated. **Unresolved requirement conflict:** the PRD says confrontation precedes saving (`context/foundation/prd.md:87`); the older exception should not silently settle the newer wording.

Related source analysis: `context/domain/01-domain-distillation.md:119–157` describes invariant gaps. This investigation rechecked relevant current paths and adds their layer placement and dependency consequences; it does not mark that entire document independently verified.

## Verification and limitations

Read-only workers covered UI/routes and persistence, while the primary investigation covered services, validators, types, pure functions and synthesis. Decisive paths were inspected directly. Tests were read, not executed: service close predicates (`src/lib/services/close-position.test.ts:11–32`), real rendering with mocked I/O (`src/components/positions/result-surfaces.test.ts:16–29`), canonical-selection creation (`src/components/positions/new-position.test.ts:131`) and cross-surface effective valuation (`tests/database/effective-valuations.test.ts:127–140`). Their presence is evidence of coverage intent, not a current passing result.

This is an architectural trace of the named Core workflows, not an exhaustive file census or a numerical coupling score. No builds, browser sessions, hosted database checks, provider calls or deployments were needed. Production code and the supplied domain document were left unchanged.

## Open questions

- What is the reason-lock window, and does category assignment belong to protected reasoning? (`context/foundation/prd.md:142`, `context/foundation/prd.md:285`)
- Does the accepted advisory confrontation exception remain valid? (`context/foundation/prd.md:87`, `context/archive/2026-10-16-reason-confrontation/plan-brief.md:80`)
- What are the accepted category retirement/restoration and sale-correction semantics? (`context/foundation/prd.md:286`, `context/archive/2026-10-27-close-position/plan-brief.md:23`)
- Hosted migration/application state remains unverified; findings describe repository-defined behavior.
