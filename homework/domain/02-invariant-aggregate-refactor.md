---
title: "Safeguarding confrontation before recording an investment"
created: 2026-11-06
type: refactor-plan
---

# Discovery → identification → classification → diagnosis → design

## 0. Discovered context and scope

This is a refactoring plan, not an implementation. The subject is `investments-diary/`, inspected at revision `b111cc7`; paths and verified line citations below are relative to that repository. The workspace root also contains DSP requirements and a CLI project, but the implemented investment diary has the matching product requirements and existing domain analysis. Preserve `context/domain/01-domain-distillation.md`; it is background, not evidence replacing source inspection. No production code or database was changed, and no runtime exploit was attempted.

Requirements were read in `context/foundation/prd.md`, together with `context/foundation/tech-stack.md`, `README.md`, foundation lessons and test strategy, and the archived confrontation decision brief. The product addresses forgotten investment reasoning rather than merely tracking money (`context/foundation/prd.md:23`). Its primary success criterion explicitly requires seeing previous same-reason investments before confirming a new one (`context/foundation/prd.md:54`). The business-logic section repeats the temporal requirement (`context/foundation/prd.md:227`, `context/foundation/prd.md:235`). Reflection must remain neutral: no score, verdict or recommendation (`context/foundation/prd.md:235`).

The stack is Astro 7, React 19, TypeScript 6, Tailwind 4, Supabase/PostgreSQL and Vercel (`README.md:9`). Foundation rationale calls confrontation the logic that makes the product worth building (`context/foundation/tech-stack.md:29`). Actual rule locations are:

| Layer | Responsibilities and evidence |
| --- | --- |
| Server page / HTTP | Astro page parses POST and orchestrates recording: `src/pages/dashboard/new.astro:69`, `src/pages/dashboard/new.astro:119`. |
| Application services | Reads, category resolution and position writes: `src/lib/services/positions.ts:99`, `src/lib/services/positions.ts:219`, `src/lib/services/positions.ts:247`. |
| Domain-like functions / validation | Category-to-history selection: `src/lib/confrontation.ts:17`; input schema: `src/lib/validation/position.ts:70`. These are functions, not an existing aggregate. |
| UI | Form submit and panel: `src/components/positions/PositionForm.tsx:222`, `src/components/positions/ConfrontationPanel.tsx:115`. |
| Persistence | Owner RLS and constraints: `supabase/migrations/20260929141102_create_diary_core.sql:40`, `supabase/migrations/20260929141102_create_diary_core.sql:59`; stock-selection trigger: `supabase/migrations/20261102080240_validate_selection_without_update_privilege.sql:3`. |

## 1–2. Identify, classify and select

Scores are ordinal judgments, not measured risk probabilities. Core importance: 5 = directly defines the product's distinctive purpose; 4 = indispensable trust guardrail; 3 = supporting correctness. Distribution counts below are **minimum cited implementation/declaration files**, not exhaustive repository totals. A missing implementation is not counted as an enforcing layer.

| Invariant derived from requirements and code | Core | Distribution: files / layers represented | Enforcement verdict and verified sources |
| --- | --- | --- | --- |
| **I1. Before recording, present the author's complete non-deleted same-category history, with reasons and dated outcomes or explicit missing-price state.** | **5** | **8 / HTTP, service, policy, validation, UI, persistence** | **Bypassable.** PRD `context/foundation/prd.md:54`, `context/foundation/prd.md:227`; `src/pages/dashboard/new.astro:119`; `src/lib/services/positions.ts:99`, `src/lib/services/positions.ts:247`; `src/lib/confrontation.ts:17`; `src/lib/validation/position.ts:70`; `src/components/positions/PositionForm.tsx:237`; `src/components/positions/ConfrontationPanel.tsx:132`; direct INSERT grant `supabase/migrations/20261102150000_grant_core_table_access.sql:9`. |
| I2. Original reason stops being editable shortly after first writing; an initially absent reason can be added later. | 5 | 2 / persistence declarations and grants | **Declared, unenforced.** PRD `context/foundation/prd.md:142`, `context/foundation/prd.md:285`; explicit deferral `supabase/migrations/20260929141102_create_diary_core.sql:4`; authenticated reason update remains granted `supabase/migrations/20261030122155_effective_snapshots_and_wallet_moves.sql:61`. Test strategy calls this unbuilt (`context/foundation/test-plan.md:211`). |
| I3. An account can read/write only its own diary; category and wallet references must belong to it. | 4 | 3 / service, persistence | **Materially enforced.** Privacy `context/foundation/prd.md:68`; request-scoped client `src/lib/services/positions.ts:23`; category owner FK and RLS `supabase/migrations/20260929141102_create_diary_core.sql:40`, `supabase/migrations/20260929141102_create_diary_core.sql:59`; wallet owner FK `supabase/migrations/20261019112848_create_wallets.sql:58`. |
| I4. Recording requires a valid owner/wallet-bound stock selection; saved identity is immutable. | 3 | 4 / validation, service, persistence | **Enforced at persistence too.** FR-003 `context/foundation/prd.md:117`; input `src/lib/validation/position.ts:73`; service `src/lib/services/positions.ts:254`; receipt expiry/ownership and immutability `supabase/migrations/20261102080240_validate_selection_without_update_privilege.sql:7`, `supabase/migrations/20261102080240_validate_selection_without_update_privilege.sql:13`; mandatory target `supabase/migrations/20261102120000_require_position_stock_selection.sql:50`. |
| I5. Wallet currency is fixed; reassignment requires owned wallets with matching denominations. | 3 | 2 / service, persistence | **Enforced atomically by RPC.** FR-015/016 `context/foundation/prd.md:202`, `context/foundation/prd.md:209`; service `src/lib/services/positions.ts:336`; immutable currency and locked move `supabase/migrations/20261030140619_set_wallet_denominations.sql:13`, `supabase/migrations/20261030140619_set_wallet_denominations.sql:35`. |
| I6. Deleting an investment hides it without destroying its facts; restoration is possible. | 4 | 3 / service, persistence | **Enforced for ordinary authenticated clients.** FR-009 `context/foundation/prd.md:146`; timestamp-only operations `src/lib/services/positions.ts:190`, `src/lib/services/positions.ts:201`; no DELETE policy `supabase/migrations/20260929141102_create_diary_core.sql:68`; grant excludes DELETE `supabase/migrations/20261102150000_grant_core_table_access.sql:9`. |
| I7. Closing records a complete valid sale pair; ordinary close operates only on open, non-deleted positions. | 3 | 2 / service, persistence | **Mixed.** FR-007 `context/foundation/prd.md:138`; pair/nonnegative/date checks `supabase/migrations/20261028120000_close_position.sql:5`; open-only transition is service predicates, not a general database transition guard (`src/lib/services/positions.ts:308`). |
| I8. A manual correction wins until a strictly later market timestamp; dates and source must remain truthful. | 4 | 2 / service, persistence | **Shared persisted selection policy.** FR-006 `context/foundation/prd.md:133`; database stamping and price precedence `supabase/migrations/20261030110418_market_price_persistence.sql:139`, `supabase/migrations/20261030110418_market_price_persistence.sql:218`; shared composition `src/lib/services/effective-price.ts:43`. |
| I9. Saved daily observations are immutable; subsequent edits must not rewrite them. | 3 | 2 / persistence | **Enforced for ordinary clients.** FR-013 `context/foundation/prd.md:172`; read-only snapshot access `supabase/migrations/20261028160000_wallet_snapshots.sql:23`; capture ignores duplicates and is service-role-only `supabase/migrations/20261030122155_effective_snapshots_and_wallet_moves.sql:50`, `supabase/migrations/20261030122155_effective_snapshots_and_wallet_moves.sql:53`. |

**Select I1.** I1 and I2 are equally central and both fail as unconditional guarantees. I1 wins the tie because it is the explicitly named primary success criterion and business logic, spans an implemented recording workflow, and has a concrete fail-open path protected by a regression test. I2 is a serious separate delivery gap, but adding its missing feature and choosing its unspecified lock duration would broaden this refactor. Stronger persistence protection for ownership, stock identity and currencies makes those less appropriate targets for this request.

**Policy conflict, not accidental history:** the archived design deliberately chose ungated saving and accepted no-JavaScript bypass (`context/archive/2026-10-16-reason-confrontation/plan-brief.md:34`, `context/archive/2026-10-16-reason-confrontation/plan-brief.md:80`). It excluded a review/confirmation step (`context/archive/2026-10-16-reason-confrontation/plan-brief.md:54`). The strict design below intentionally supersedes those choices under this request's fail-fast constraint. It is a behavior-tightening refactor, not behavior-preserving cleanup. Keep the neutral reflection goal and measure the under-60-second recording target (`context/foundation/prd.md:74`).

## 3. Diagnosis of I1

| Current location | Observed behavior / missing enforcement | After refactoring |
| --- | --- | --- |
| `src/pages/dashboard/new.astro:119` | Valid save invokes creation and redirects before history is loaded. A valid first POST needs no previous GET. | Parse a prepare or confirm command; never insert directly. A first submission prepares and renders review. |
| `src/pages/dashboard/new.astro:178` | Catch reports history failure and substitutes `null`; comment explicitly permits saving. Successful saves have already returned. | Preparation failure stops the command with `ConfrontationUnavailable`; preserve draft fields in the response. |
| `src/lib/services/positions.ts:99` | Reads all owner history across categories; `deleted_at` and deterministic ordering are correct. No proof the relevant history was offered before save. | Repository obtains complete, category-scoped history in a consistent database snapshot and stores the prepared review. Retain shared effective-price policy. |
| `src/lib/services/read-all.ts:13` | Pagination throws on errors/missing data; this layer does not swallow them. Multiple HTTP pages are not one database snapshot. | Keep for other reads; authoritative preparation uses a single transactional database query, not separate page requests. |
| `src/lib/services/positions.ts:213` | Active case-insensitive category resolution is separate from client filtering. A typed new name may reuse an existing category. | Resolve once during preparation under owner serialization; aggregate binds review to the resolved identity. |
| `src/lib/services/positions.ts:243`, `src/lib/services/positions.ts:279` | Category creation and position insertion are separate HTTP writes; failed insertion may leave a category. No review identity/precondition. | Replace public creation path with aggregate repository commands. New category becomes durable only with final recording. |
| `src/lib/validation/position.ts:70`; `src/types.ts:60` | Schema and command type contain fields but no prepared review reference. Input validity is not workflow validity. | Separate draft parsing from confirmation parsing; opaque attempt ID and version identify server-owned state. No client boolean establishes eligibility. |
| `src/lib/confrontation.ts:29` | Client resolves typed category names and filters history; `null` becomes `unavailable`. | Remove authoritative resolution/filtering from this path. Render server-prepared review DTO; any live convenience panel remains advisory. |
| `src/components/positions/PositionForm.tsx:222`, `src/components/positions/PositionForm.tsx:237`, `src/components/positions/PositionForm.tsx:495`, `src/components/positions/PositionForm.tsx:543` | Submit blocks field errors only; panel and save button are independent. No-JS can save a newly chosen category without first displaying its history. | Form requests preparation; review shows the bound draft and history before a distinct confirmation POST. Both JS and no-JS use the same protocol. |
| `src/components/positions/ConfrontationPanel.tsx:132`, `src/components/positions/ConfrontationPanel.tsx:145` | Unavailable explicitly permits save; genuine empty history renders correctly. | Failure says retry without losing draft and exposes no confirm action. Preserve legitimate empty state and dated/missing outcomes (`src/components/positions/ConfrontationPanel.tsx:54`). |
| `supabase/migrations/20260929141102_create_diary_core.sql:62`; `supabase/migrations/20261102150000_grant_core_table_access.sql:9` | Owner RLS plus INSERT privilege permits direct authenticated inserts. No workflow guard. Stock validation is independent (`supabase/migrations/20261102080240_validate_selection_without_update_privilege.sql:13`). | Add a forward migration revoking ordinary direct INSERT and removing its now-obsolete policy; only guarded aggregate recording RPC can insert. Retain stock/FK/check protection. |
| `src/lib/observability/read-boundaries.test.ts:172` | Test explicitly expects save after failed history read. | Replace with failure/no-write contract; add successful prepare→render→confirm case. |
| `src/lib/services/read-contracts.test.ts:160`; `tests/database/effective-valuations.test.ts:129` | Verify read transport/effective values, not recording eligibility. | Preserve valuation coverage; add aggregate workflow, concurrency and direct-access tests. |
| `scripts/testing/database/contract/grants.mjs:11` | Checks policies have grants; blindly revoking INSERT while leaving its policy would conflict with this check. | Remove obsolete insert policy with the privilege; extend catalog/access expectations for aggregate tables and RPC grants. |

There is no authoritative enforcement in the inspected HTTP, application-service or persistence creation path. The UI is the only presentation safeguard, and even it does not gate submission. Receipt/category exceptions in `createPosition` stop with failure (`src/lib/services/positions.ts:255`, `src/lib/services/positions.ts:265`); these are **not** swallow-and-continue cases. The consequential swallowed failure is the route's history catch. Retaining a cached quote after provider failure is legitimate degraded data, distinct from failing to obtain the history itself.

## 4. Design: a recording-attempt guardian aggregate

### Boundary and enforceable contract

Proposed aggregate root: **`InvestmentRecording`**, identity `RecordingId`. A saved position alone cannot guard an event that must precede its creation; a wallet would impose an unrelated boundary, and loading an entire diary as mutable entities would be excessive. The root owns one proposed investment, its canonical category identity/name, immutable confrontation snapshot, preparation time, expiry, diary revision, confirmation version and resulting position ID. Existing positions are read-model evidence, not children to mutate. Other aggregates remain references: author, wallet and stock-selection receipt.

An accepted recording must reference a complete server-prepared review for the same author and exact draft, followed by an explicit confirmation command. The review includes all non-deleted same-category positions across the author's wallets, open and closed, regardless of purchase date; this matches the established interpretation (`context/archive/2026-10-16-reason-confrontation/plan-brief.md:35`). A genuinely empty result is successful preparation. Missing prices remain explicit missing outcomes; they do not authorize omitting investments. No provider download occurs during preparation or confirmation.

A server can establish that a review was prepared and offered before confirmation; it cannot prove that a human read or understood it. Do not claim that an acknowledgement proves attention. Browser tests establish the actual app renders the review before presenting confirmation. A caller deliberately automating prepare→confirm can satisfy the protocol; this is not a human-attention security boundary.

### Authoritative placement and repository

Use a **database-resident aggregate implementation** because Supabase already exposes authenticated database access and existing commands use transactional RPCs (`supabase/migrations/20261030140619_set_wallet_denominations.sql:31`). The domain methods below are language-neutral pseudocode implemented as private PostgreSQL routines; TypeScript names are typed facades, not a second implementation of the guards. The root's transition routines are the single authority for I1. RLS, privileges and foreign keys protect access and structural integrity without independently reimplementing the review policy.

Proposed repository interface:

```ts
interface InvestmentRecordingRepository {
  prepare(draft: RecordingDraft): Promise<PreparedRecording>;
  load(id: RecordingId): Promise<RecordingView>; // owner-scoped; no mutable table DTO
  confirm(id: RecordingId, expectedVersion: number): Promise<RecordedInvestment>;
}
```

Each mutating facade makes **one RPC**; private repository load/save and aggregate invocation run inside that RPC's transaction. Do not implement `load → validate → save` as separate Supabase HTTP calls. Public RPCs derive the author from `auth.uid()`, never a trusted-looking request-body `user_id`. Use narrowly privileged security-definer entry points with fixed empty search path, fully qualified objects, explicit ownership checks, and EXECUTE revoked from PUBLIC/anon. Internal persistence and transition functions are not directly executable by authenticated clients. Store aggregate tables privately with no client write grants; expose owner-filtered read/RPC projections. Remove ordinary position INSERT privilege and policy in the same forward migration. Existing user updates and RPCs must participate in revision serialization described below.

### Methods, preconditions and named errors

```text
InvestmentRecording.prepare(author, validatedDraft, completeHistory, diaryRevision, now)
  require authenticated author else throw RecordingNotFound
  require draft's wallet/category/receipt owned and usable else throw RecordingInputInvalid
  require completeHistory.loadedSuccessfully else throw ConfrontationUnavailable
  resolve typed category using database active-name semantics
  require history matches resolved category and author else throw ConfrontationMismatch
  capture immutable exact draft + history + revision + price/source times
  set state = Prepared, version = 1, expiresAt = now + 15 minutes
  return PreparedRecording(id, version, draft, review, preparedAt, expiresAt)

InvestmentRecording.confirm(author, expectedVersion, currentRevision, receipt, now)
  require same author else throw RecordingNotFound
  if state == Recorded and expectedVersion == confirmedVersion:
    return original positionId                 // safe retry of identical command
  require state == Prepared else throw RecordingStateInvalid
  require version == expectedVersion else throw RecordingVersionConflict
  require now < expiresAt else throw ConfrontationExpired
  require revision == currentRevision else throw ConfrontationStale
  require receipt still valid for draft wallet else throw StockSelectionExpired
  // no replacement draft fields accepted here
  emit PositionToRecord(exactStoredDraft, resolvedCategory)
  set state = Recorded; remember confirmedVersion and resulting positionId
```

Fifteen minutes is a proposed review lifetime, not a discovered business constant. Editing any draft field creates a new prepared attempt; an old confirmation can only record the old, explicitly displayed draft. The form must discard its old confirmation reference when returning to edit. A request mixing changed draft fields into confirmation is rejected, rather than silently recording different facts. SQL raises stable machine-readable domain codes; the repository translates those into named domain error classes. Guard routines must not catch a domain exception and return success. Expected errors carry no financial prose in logs or URLs.

### Consistency and one-transaction recording

Introduce a per-author diary guard/revision row. History-changing position/category writes acquire that guard **before** changing rows and increment revision. Include create, reason/category edits, buy/sale/manual-price updates, soft delete/restore and reassignment, including direct PATCH paths and existing RPCs. Existing RPCs currently lock position first (`supabase/migrations/20261030140619_set_wallet_denominations.sql:36`); revise their lock order to guard → aggregate → position → wallets sorted by ID to avoid introducing lock inversion. For residual authenticated direct updates, a BEFORE STATEMENT trigger locks the guard for auth.uid() before tuple locks are acquired; row triggers increment that guard revision after checking ownership. A row-level BEFORE trigger alone is insufficient to establish guard-first lock ordering. Controlled RPCs explicitly acquire the guard first. Maintenance operations touching multiple authors must lock their guards in sorted order before tuple writes. Test multi-row updates and deadlock handling; database deadlock/serialization errors roll back and require a new user retry, never a successful response.

Preparation locks that guard and obtains complete history in one consistent query, then stores snapshot and revision. New category resolution may reserve an identity/name inside the attempt without inserting a durable category. Another attempt creating that name changes the author revision, making the first attempt stale. At confirmation, category resolution is revalidated while holding the guard. Existing unique indexes remain the final race backstop. The revision is deliberately coarse for this small diary: unrelated diary edits may demand another review.

Quote-cache refresh alone need not invalidate a review: its outcomes are observations **as of the displayed preparation/market times**, consistent with the product's acceptance of old cached prices (`context/foundation/prd.md:172`). Manual edits and sales do invalidate it. This is an explicit consistency choice; the review promises a complete dated snapshot, not continuously live market data.

```text
confirm_recording_rpc(id, version):                 // ONE PostgreSQL transaction
  author = auth.uid(); require authenticated
  repo.lockAuthorGuard(author)
  recording = repo.loadOwnedForUpdate(id, author)   // unknown/foreign indistinguishable
  receipt = repo.loadSelectionAndWallet(recording.draft)
  command = recording.confirm(author, version, guard.revision, receipt, databaseNow)
  if command is alreadyRecorded: return original ID
  category = repo.resolveOrInsertReservedCategory(recording)
  positionId = repo.insertPosition(command, category) // existing stock trigger/FKs still run
  repo.saveRecorded(recording, positionId)            // optimistic version + unique link
  commit                                              // position + category + consumption together
on any exception:
  rollback                                            // no position, category or consumed review
  rethrow named domain error or infrastructure error
```

Preparation and confirmation are necessarily separate transactions around a human interaction; do not hold a transaction open while the user reads. The complete final operation—revalidation, category creation, position insertion and recording consumption—is one transaction. A unique resulting-position/recording association and row lock prevent double recording. A lost successful response returns the same position ID on an identical retry, even if time or revision subsequently advances. Expiry is checked before the first successful transition, not before returning an already committed result.

### Thin route and presentation protocol

```text
POST prepare:
  authenticate + same-origin check
  parse RecordingDraft
  prepared = repository.prepare(draft)          // invokes root.prepare
  render exact prepared draft + full review + confirmation form; Cache-Control: no-store

POST confirm:
  authenticate + same-origin check
  parse only RecordingId + expectedVersion
  result = repository.confirm(id, version)      // invokes root.confirm
  redirect on success

catch named domain error:
  map to response; retain private form values in body, never query parameters
catch unexpected infrastructure error:
  report once; respond 503; never continue writing
```

Map malformed input/invalid fields to 422; unauthenticated requests to the established sign-in flow (RPC denies them); unknown/foreign recording to 404; expired/stale/version/state conflicts to 409 with a prepare-again action; history/infrastructure unavailability to 503. Forbidden origin remains 403 (`src/pages/dashboard/new.astro:74`). A stale response must not silently confirm a newly generated review. Both browser modes show the review before the confirm button is usable. Client-side disabling is helpful feedback; the server aggregate rejects the same illegal commands independently.

## 5. Phased refactoring and verification

1. **Specify the stricter contract, test-first.** Replace the permissive expectation at `src/lib/observability/read-boundaries.test.ts:172` with rejection/no-write cases. Add prepare/render/confirm acceptance scenarios, including no-JS. Record the supersession of the archived ungated-save decision in current requirements; do not rewrite archived history. Keep these tests failing until the guarded path exists.
2. **Build the guardian and repository, database-test-first.** Add forward migrations for recording state, private snapshots, owner guard/revision and private transition routines. Implement preparation and atomic confirmation together with owner isolation, full rollback and concurrency tests. Preserve decimal strings and price provenance. Do not edit already applied migrations.
3. **Integrate HTTP and UI, test-first.** Replace direct creation with repository calls, render server-prepared review, and map named failures. Remove duplicated category resolution from the authoritative client path and the “still save” failure copy. Preserve typed fields, empty history, optional reason, missing-price wording and neutral presentation.
4. **Close bypasses and migrate callers, test-first.** Switch all ordinary creation callers/fixtures to the guarded protocol. In the same release, revoke direct INSERT and remove its policy; test the production-privilege migration chain. Update existing RPC lock order and revision coverage before enabling strict confirmation. Demo/admin import scripts must be explicitly classified as maintenance paths; they must not become a public bypass. Existing saved positions remain unchanged and need no fabricated historical review evidence.
5. **Verify and remove obsolete paths.** Retire the ungated `createPosition` implementation after callers move, update read-boundary/transport tests, and document the protocol and names. Run focused unit/SSR tests, local real-database tests, migration/grant tests, HTTP smoke and the existing browser flow in JS/no-JS modes. Measure recording time against the product target. Rollout is additive and coordinated; a failed rollout disables recording rather than re-enabling an unguarded INSERT path. Deployment is outside this plan's execution scope.

The repository has an actual runner: `vitest.config.ts:6` discovers source/script tests; `vitest.database.config.ts:3` separates database tests. Existing guidance requires independent expected values, exact decimals, clock boundaries and behavior-breaking verification (`context/foundation/test-plan.md:157`, `context/foundation/test-plan.md:171`). Apply test-first to phases 1–4 because they change the invariant; phase 5 is verification/documentation. No production mutation or test execution is part of this document-only task.

| Test group | Required valid and invalid cases |
| --- | --- |
| Preparation / membership | Existing category includes all matching owner positions across wallets, including closed positions and backfills; excludes deleted/foreign/other categories. Typed case-insensitive duplicate name resolves to existing history. New category gives explicit empty history. More than an API page of matching positions remains complete. History failure aborts; partial history never becomes empty success. |
| Outcomes | Reasons remain author text; absent reason is explicit. Open manual/automatic values, closed zero-price sale, missing price and failed-refresh cached quote retain correct source/time and independently calculated decimal results. No recommendation, generated reason or provider fetch. |
| State transitions | Prepare→confirm succeeds; direct confirm without preparation fails. Wrong owner/ID fails without disclosure. Changed draft/category/wallet/receipt cannot reuse review. Expected version mismatch, expiry immediately before/at/after boundary and stale revision fail before insert. Exact committed retry returns original ID; conflicting retry fails. |
| Atomicity | Inject failure after category insertion, position insertion and before recording save: every write rolls back. Two concurrent confirmations create exactly one position. Concurrent same-name category creation either serializes or makes the other review stale. No transaction remains open across rendering. |
| Mutation races | Concurrent insert, reason/category edit, close, manual price update, deletion, restoration or move cannot commit past an unchecked review revision. Test each ordinary service/RPC and direct allowed update path. Quote-only refresh retains the dated prepared observation by design. |
| HTTP / UI | First valid POST renders review without position insertion; subsequent confirmation redirects. JS and no-JS show correct history before confirm. Category change/new-name collision needs preparation. Failure retains fields and offers retry; absent/forged attempt IDs and cross-origin POST cannot record. Sensitive text is absent from redirects and diagnostics. |
| Privileges / migrations | Fresh migration chain and upgrade from current chain; anon denied; owner access only; direct authenticated position INSERT denied even with valid stock receipt; aggregate-table writes and private routine execution denied; public confirmation derives auth identity. Guarded creation still passes existing stock/FK/currency constraints. |

### Names and contract registration

No general load-bearing-name registry was found in the inspected product context. The database `contract/` directory is executable access/grant coverage (`scripts/testing/database/contract/grants.mjs:9`), not a vocabulary registry. Do not invent a mandatory new registry. Record proposed names in this plan and update the domain map when implementing: `InvestmentRecording`, `RecordingId`, `RecordingDraft`, `PreparedRecording`, `RecordedInvestment`, `InvestmentRecordingRepository`; states `Prepared` and `Recorded`; errors `RecordingNotFound`, `RecordingInputInvalid`, `ConfrontationUnavailable`, `ConfrontationMismatch`, `RecordingStateInvalid`, `RecordingVersionConflict`, `ConfrontationExpired`, `ConfrontationStale`, `StockSelectionExpired`; RPCs `prepare_investment_recording` and `confirm_investment_recording`; persistence names `investment_recordings` and `diary_recording_guards`. Register the new table access expectations and RPC privileges in the existing database contract tests as executable contracts.

## Summary

The selected invariant is confrontation with prior same-reason investments before recording a new one. It is central to the stated product purpose, yet the implemented save path bypasses it and explicitly tolerates history-read failures. The proposed InvestmentRecording aggregate makes preparation and subsequent confirmation a server-enforced protocol. A database-resident authority and restricted write privileges prevent route-only enforcement from leaving direct INSERT open. Final confirmation records the investment, creates any necessary category and consumes its review in one transaction. Revision checks reject intervening diary changes while preserving explicitly dated cached-price observations. Test-first phases cover failure, concurrency, privacy and both browser modes, and intentionally supersede the earlier ungated-save decision. This document changes no production code and does not claim to prove that a human actually read the presented history.
