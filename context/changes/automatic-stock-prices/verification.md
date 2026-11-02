# Automatic stock prices — verification

## Plan persistence

- Saved the agreed five-phase plan and brief before beginning Phase 1.
- Verified five phases and fifteen matching, initially unchecked Success Criteria/Progress rows.
- Saved plan SHA-256: `dae15d9f9e7cb9aeecc83fe40a2717db4e01cb1b27a3f6dba496c8c0c0440218`.
- Saved brief SHA-256: `0d5657e4813500a85836d1be69592fafd51e16507799e5592d441a091be484c3`.
- Loaded planning skill: `/Users/noemi.kowalewska/Documents/projects/xdev10/.agents/skills/10x-plan/SKILL.md`.
- Loaded skill SHA-256: `5c82d6f4d96592539f1a561111726689c79ff8446ab27946dd957cc29645ccfe`.
- Change identity was preserved; status advanced from preparing to planned using the metadata guard, then to implementing on entry to Phase 1.
- Roadmap lookup found no exact `automatic-stock-prices` item; the roadmap is unchanged.

## Context7 integration check — 2026-10-29

Context7 tools were not exposed through the session's native tool inventory. The
configured anonymous hosted endpoint was queried directly using read-only MCP
requests after network approval: `tools/list`, `resolve-library-id`, and two
`query-docs` calls. The resolved library was `/gadicc/yahoo-finance2`.

The returned documentation supported a class instance, search, keyed batch quote
results, and per-call third-argument `fetchOptions.signal` cancellation. Search
does not establish reliable currency; the selected listing needs quote confirmation.
Results cited the project's development branch, so compatibility was cross-checked
against tagged version 4.0.5 and subsequently its installed package declarations.
This check is documentation evidence, not a successful live quote or native-client
MCP activation test.

Sources:

- [Context7-indexed request options](https://github.com/gadicc/yahoo-finance2/blob/dev/docs/README.md)
- [Tagged quote contract](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/modules/quote.ts)
- [Tagged search contract](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/src/modules/search.ts)
- [Tagged request options](https://github.com/gadicc/yahoo-finance2/blob/v4.0.5/docs/README.md)

## Phase 1 preflight — 2026-10-30

- Use Node 24.21.0 from the configured fnm installation; the shell's default Node 26 is not the verification runtime.
- Pinned `yahoo-finance2@4.0.5` installed successfully after sandbox DNS restrictions required network approval.
- Existing Astro, ESLint and Vitest binaries and test/build scripts are present.
- Later-phase decimal/snapshot/cron/smoke scripts exist, but database execution currently needs the stopped local Docker daemon. These checks are not claimed as passed.
- A cached Vercel CLI is available and authenticated. A controlled preview is permitted by the repository deployment policy; production promotion is outside this phase.
- No application valuation, database migration or provider selection fallback is enabled in Phase 1.

## Phase 1 results

### Implemented

- Pinned dependency, normalized server-only adapter and shared quote/listing DTOs.
- Explicit public-symbol probe command: `npm run probe:market-data -- --live`.
- PRD FR-006 and FR-013 amendments plus FR-014–FR-016 for the agreed later integration.
- No application route, database write, cached valuation or price-selection behavior is activated.

### Automated gates — 2026-10-30

- `astro sync`: PASS under Node 24.21.0.
- `vitest run src/lib/market-data/yahoo.test.ts`: PASS, 39 fixture tests.
- `npm run lint`: initially failed on six type-aware style findings; corrected without changing the contract. Second run: PASS.
- `astro check`: PASS, 133 files, zero errors/warnings/hints.
- Deliberate-break check: removed the confirmed-currency comparison in the worktree; the currency-mismatch fixture failed as expected (38 passed, 1 failed). Unconditionally restored the exact staged adapter with `git checkout --`, then verified no worktree adapter diff remained.
- `npm run build`: PASS, Vercel server output.
- `npm test`: PASS, 25 files and 321 tests, including the restored adapter.
- Whitespace checks: research metadata's Markdown hard-break spaces were replaced with paragraph separation; final staged/worktree checks are clean.

Database transport/cron/snapshot checks belong to the persistence/valuation phases:
Phase 1 adds no Supabase numeric projection, write or schema change. The new
provider DTO and its decimal normalization are exercised by the adapter fixtures;
existing database decimal decoding is unchanged. Docker remains stopped.

### Actual adapter: local public-symbol probe

`npm run probe:market-data -- --live` passed on Node 24.21.0 at approximately
2026-10-30T09:04:46Z. Search, confirmation and keyed batch retrieval succeeded for
`AAPL` (USD, NMS, America/New_York) and `PKO.WA` (PLN, WSE, Europe/Warsaw).
Controlled stalled-fetch cancellation through the installed SDK passed in 103 ms.
Only safe metadata was printed; no raw prices, cookies or provider payloads were logged.

At that local check, Apple's regular-session quote time was 2026-10-29T20:00:01Z
while PKO's was 2026-10-30T08:48:52Z. The adapter retained those market timestamps
separately from the fetch times. The provider-reported delay field is metadata,
not proof of the quote's actual age or a freshness guarantee.

### Actual adapter: protected Vercel preview

- Deployment: `dpl_1VddFiuAo1b5Atmwg24PWtK9Rri5`.
- Temporary URL: `https://investments-diary-kwmn1faqx-wakarimasen8-8554.vercel.app` (removed after validation).
- Deployment output confirmed preview target, no production URL and Vercel Authentication protection.
- Isolated fixture copied the adapter, stripped TypeScript without changing its behavior, pinned the same SDK, and contained fixed public symbols only. No diary source data or environment files were copied; deployment-level Supabase variables were blanked.
- Verified the deployed adapter transform matches current source SHA-256 `4f184f5732cc65f03ec428bae245466f8d0428257ef1677b524fe2c08a4debfd`.
- Protected probe passed under Node 24.21.0 at approximately 2026-10-30T09:09:02Z: US/GPW search, confirmation and batch retrieval all succeeded. Installed-SDK stalled-fetch cancellation passed in 100 ms.
- Preview metadata preserved Apple's market timestamp 2026-10-29T20:00:01Z and PKO's 2026-10-30T08:54:00Z independently of fetch timestamps.
- CLI adaptation: this cached CLI forwarded `--cwd` into curl in both flag positions. Running `vercel curl` with the fixture directory as the actual process working directory succeeded. No provider request occurred in the failed CLI argument attempts.
- Removed precisely this deployment by ID with `vercel remove ... --yes --safe`; CLI confirmed removal. Production deployment and diary data were not changed.

### Human verification / commit state

Progress items 1.1–1.3 are checked, including the owner’s manual confirmation of
the recorded local/deployed probe evidence. The owner approved the Phase 1 commit
message on 2026-10-30. Phase 2 is the next implementation phase.

## Phase 2 preflight and approved sequencing — 2026-10-30

- Phase 1 committed as `827fbc0` after owner confirmation and message approval.
- Local Supabase Docker containers are running; baseline `npm run test:decimal-db` passed (2 files, 11 tests) before Phase 2 changes.
- Owner approved bringing the minimal wallet currency field, validation, service write and affected fixtures forward from Phase 4. This permits strict new-wallet currency enforcement without breaking the intermediate application.
- USD, PLN and EUR follow the owner’s saved Phase 2 contract; no FX conversion is introduced.
- Phase 2 is delegated; the parent retains gates, staging, manual confirmation, Progress and commit.

## Phase 2 results — 2026-10-30

### Implemented

- Applied additive local migration `20261030110418_market_price_persistence.sql`; generated database types from the resulting schema. CLI emitted a benign MaxListeners warning during generation.
- Nullable legacy wallet currency, explicit attestation, database-stamped confirmation and frozen confirmed denomination; new wallets require USD/PLN/EUR. Native wallet POST form preserves entered values and supports ordinary unconfirmed legacy edits.
- Owner-scoped immutable listing identities and quote cache, restricted claim/finish RPCs, 30-second token leases, failed-attempt cooldown, last-valid quote retention and older-quote rejection.
- Database-stamped manual-save time, including identical resubmissions; historical save times remain null.
- Security-invoker effective-price view with sale/manual override/automatic/manual fallback/missing selection. Existing application valuation reads and snapshot capture are integrated in Phase 4.
- EUR adapter acceptance and affected smoke, demo, database and renderer fixtures updated. No quote-download trigger is enabled here.

### Automated evidence

- `npm run test:market-prices-db`: PASS, including preserved legacy facts/history, ordinary owner roles, incompatible currency, database timestamp protection, equal versus strictly later market time, identical manual resaves, competing connections, expired lease recovery, late-token refusal, cooldown and retained cached value. Passed again after deliberate-break restoration.
- `npm run test:decimal-db`: PASS, 3 files / 12 tests. Actual PostgREST quote RPC/view round trips preserve `999999999999.99999999` and `0.00000001`, owner isolation and failure retention.
- Deliberate break: temporarily changed cached-market `<=` manual-save comparisons to `<` in the staged migration's worktree copy. Disposable database test failed specifically with `equal market timestamp replaced manual correction`. Unconditionally restored with `git checkout --`; no changed schema was applied to the diary database.
- Actual applied local schema reports `market_quote_cache|t` for RLS, and separate `market_quotes_insert_own|INSERT|{authenticated}`, `market_quotes_select_own|SELECT|{authenticated}`, `market_quotes_update_own|UPDATE|{authenticated}` policies. Authenticated arbitrary quote PATCH remains denied by column grants; owner-checked RPCs perform cache mutations.
- `npm run test:snapshots-db`: PASS, immutable history, exact arithmetic, concurrent idempotency and write restrictions.
- `npm run test:close-db`: PASS, fresh migration chain, unchanged facts, sale constraints and isolation.
- `npm run test:demo-db`: PASS, 2 tests; initial sandbox CLI filesystem denial resolved by the permitted rerun.
- Astro sync and lint: PASS. Astro check initially found 3 missing-field errors in observability fixtures; corrected the fixtures and reran successfully: 136 files, zero errors/warnings/hints.
- Final static sequence after the renderer-fixture fix: Astro sync → lint → Astro check → build all PASS.
- `npm test`: PASS, 26 files / 326 tests. Initial new wallet page tests lacked the React test renderer; registered the renderer and reran the full suite successfully.
- Local HTTP smoke: all steps PASS, including new-wallet creation, retained invalid form values, wallet edits, ownership and position regressions. Dev server remains available at `http://127.0.0.1:4321` for owner verification.

### Manual handoff

Progress 2.1–2.3 are verified. The owner confirmed manual check 2.3 passed on 2026-10-30: legacy wallet/position facts are unchanged and currency stays unconfirmed until explicitly assigned. Phase 2 was committed as `b83a91d` after owner approval of the message. No production migration or deployment occurred.

## Phase 3 preflight — 2026-10-30

- Owner chose delegated implementation after Phase 2 commit `b83a91d`; parent retains gates, staging, Progress and commit.
- Existing Node 24 Astro/Vitest/ESLint/build tools and running local Supabase are available. New endpoint/service tests will run with provider fixtures, not uncontrolled live Yahoo requests.
- Phase 2 cache claim/finish RPCs already provide token leases, failed-attempt cooldown and last-valid quote retention. Phase 3 will add orchestration and cross-request server-validated listing lookup receipts.
- Source inspection of pinned SDK `yahooFinanceFetch.js` found direct URL logging on unsuccessful HTTP responses; the adapter must intercept HTTP errors before SDK processing and retain only sanitized status/Retry-After metadata. Consent redirects must remain supported.
- No UI download controls or valuation-read integration are enabled until Phase 4.

## Phase 3 results — 2026-10-30

### Implemented and adaptations

- Added authenticated, same-origin JSON POST endpoints for metadata search, candidate download, saved-result confirmation and mapped-holding downloads. Strict request schemas reject browser-supplied exchange/currency/price metadata; GET/HEAD and other methods cannot invoke the actions.
- Added request-scoped repository and orchestration: owner/open/non-deleted selection, identity deduplication, batches up to 50, separate batches for conflicting identities sharing a symbol, one five-second budget, fresh request signals, atomic leases and persisted cooldowns. Claimed but unattempted work is released and remains due.
- Added local additive migration `20261030114323_listing_lookup_receipts.sql`, generated database types and nullable-claim API override. Owner/position-bound receipts expire after 30 minutes; confirmation reads persisted validated data without a provider request. Receipt expiry never triggers a download.
- SDK HTTP errors are intercepted before its direct URL logging, retaining only safe status and Retry-After metadata. Manual consent redirects remain supported. Allowed observability operations/routes and privacy tests were updated.
- Added [API walkthrough](download-api.md) for the Phase 3 manual check. Dashboard controls, listing island and valuation-read integration remain Phase 4 work.
- Review corrected older-quote result reporting to include the actual persisted retry cooldown while retaining the valid cached price.

### Automated evidence

- Plan gates: orchestration 17 tests, endpoints 23 tests, trigger/adapter 43 tests all PASS (83 focused tests after the older-quote regression was added).
- Deliberate break: removed the endpoint's Origin comparison only in the worktree. All four origin-protection tests failed (HTTP 200 instead of 403); the endpoint was unconditionally restored from its staged copy with `git checkout --`. Restored tests passed subsequently.
- `npm run test:decimal-db`: PASS, 3 files / 12 tests, including real service-to-PostgREST lookup/confirmation, exact quote transport, receipt binding/expiry, concurrent lookup claims, expired-lease recovery, late-token rejection, longer retry delays, restricted writes and foreign-owner rejection.
- `npm run test:market-prices-db`: PASS, full additive migration chain, preserved legacy/history, manual boundaries, quote claims/cooldowns and older-quote rejection. The latest installed snapshot capture definition is also checked for provider HTTP calls.
- Actual local schema reports `market_listing_lookups|t` for RLS and separate `listing_lookups_insert_own|INSERT|{authenticated}`, `listing_lookups_select_own|SELECT|{authenticated}`, `listing_lookups_update_own|UPDATE|{authenticated}` policies. Direct authenticated receipt updates are denied by grants and covered by real REST tests.
- Astro sync: PASS. Lint initially found 53 type/style findings, then 17 after the first fix; stateless function-property types and explicit mock/callback types resolved them. No rules or assertions were relaxed. Final lint PASS.
- Astro check initially found 3 provider-mock literal-widening errors in the database fixture; explicit provider types corrected them. Final check PASS, 147 files and zero errors/warnings/hints.
- `npm run build`: PASS, Vercel SSR output.
- `npm test`: PASS, 29 files / 370 tests.
- Local HTTP smoke: all steps PASS against `http://127.0.0.1:4321`. These regression checks do not claim a live Yahoo download or Phase 4 UI integration.

### Manual handoff

Progress 3.1–3.4 are verified. The owner confirmed manual check 3.3 passed on 2026-10-30 using the API walkthrough. Phase 3 was committed as `0201301` after owner approval of the message. No production migration or deployment occurred.

## Phase 4 preflight — 2026-10-30

- Owner chose delegated application integration after Phase 3 commit `0201301`; parent retains verification, staging, manual confirmation, Progress and commit.
- Local Supabase, Node 24 tooling, Playwright 1.64.1 and local E2E credentials are available. Configuration presence was checked without printing credential values.
- Phase 4 must compose saved effective prices across position/confrontation/wallet reads and future capture, while keeping manual inputs separate. The existing midnight UTC job must not perform provider work.
- Browser checks will exercise explicit controls, retained form input, errors and legacy-history separation against local fixtures. No production data or deployment is part of this phase.

## Phase 4 results — 2026-10-30

### Implemented and adaptations

- Position list/detail, confrontation and wallet reads now use the security-invoker effective-price view through one strict decimal-text decoder. Raw manual values remain separate. Closed positions preserve valid zero-sale semantics. Confrontation uses the existing paginated read helper with stable ordering.
- Dashboard and listing controls issue provider actions only on explicit clicks. Search, candidate download and confirmation remain separate. Read-only SSR fragments refresh after actions without replacing manual/sale/move forms. Source, currency, actual quote time, market state, provider-reported delay, override and recoverable failure context are visible.
- Added an owner-checked wallet-move RPC/endpoint and compatible-target control, including explicit legacy amount attestation. Direct authenticated wallet_id updates are denied; manual saves, closing, soft deletion and restoration remain available.
- Applied local additive migrations `20261030122155_effective_snapshots_and_wallet_moves.sql` and `20261030123038_order_wallet_move_locks.sql`. The second corrects wallet lock ordering without editing an applied migration. Generated database types came from the CLI.
- Future captures select cached effective prices and record denomination, open automatic/manual coverage and oldest automatic market time. Existing observations remain unchanged with nullable unknown context and display separately from denominated charts. Signature, restricted capture permissions, daily idempotency and midnight UTC scheduling remain unchanged; capture performs no provider requests.
- Screenshot review led to wrapping source context within result cells and waiting for the dashboard's completed state before its screenshot. Test screenshots hide only the development toolbar.

### Automated evidence

- Gate 4.1: `npm run test:decimal-db` PASS, 4 files / 13 tests, including real PostgREST cross-surface parity, strict decimals, zero sale, manual correction, owner/currency move boundaries, unchanged position facts and retained ordinary write permissions.
- Focused read/decoder/move-endpoint/result/control/history tests PASS, 8 files / 55 tests.
- Gate 4.2: `npm run test:market-prices-db` PASS, including full-chain legacy preservation, denied direct reassignment, legacy attestation, automatic/manual capture coverage, excluded holdings, moved zero-sale capture and unchanged prior observations.
- `npm run test:snapshots-db`: PASS, exact totals, concurrent idempotency, RLS/write restrictions, gaps and immutable history.
- `npm run test:wallet-cron`: PASS, midnight UTC schedule, idempotent registration and restricted capture permissions; its metadata transaction was rolled back.
- Deliberate break: substituted raw manual current_price for selected open price in the decoder's worktree. The selection test failed (15 instead of 12.12345678), while the zero-sale and numeric-boundary tests passed. Unconditionally restored the staged decoder using `git checkout --`; the restored full suite passed.
- Actual applied privilege checks returned `f|t` for authenticated wallet_id/current_price UPDATE, and `f|t` for authenticated/service-role capture EXECUTE.
- Astro sync, lint, Astro check and build: final PASS. Lint's initial two PriceContext style findings were corrected without changing rules or assertions. Final type check: 160 files, zero errors/warnings/hints.
- `npm test`: final PASS, 33 files / 383 tests.
- Local HTTP smoke: all steps PASS after the read-contract switch.
- Chromium fixtures: final PASS, 2 tests in 6.1 seconds. They cover no download on load/reload/focus, duplicate prevention, lookup confirmation without another quote, retained manual/sale inputs, actual wallet move and read-only refresh, completed dashboard state, retained failure prices, history ranges/reload, keyboard/mobile/no-JS and dense point selection. No Yahoo request is used by these browser fixtures.
- Initial browser run found client `_jsxDEV is not a function` errors despite correct server-rendered HTML. Restarting the assistant-owned long-lived development server in development mode resolved both tests without application changes. After the final build, verification used a fresh development server again.
- Reviewed final desktop dashboard/detail and mobile history screenshots under `test-results/market-price-controls-pric-9b4b9--unsaved-manual-sale-values-chromium/` and `test-results/wallet-dashboard-daily-wal-e2f19-d-keyboard-mobile-and-no-JS-chromium/`. These are ignored local test artifacts, not committed diary data.

### Manual handoff

Progress 4.1 and 4.2 are verified. Item 4.3 remains unchecked pending owner confirmation of the [UI walkthrough](ui-verification.md). The local app is running at `http://127.0.0.1:4321` for that check. Phase 4 is staged but not committed pending manual confirmation and commit-message approval. No production migration or deployment occurred.

## Phase 4 owner revision — 2026-10-30

Manual check 4.3 was not approved. The owner reported the dashboard download button unavailable, then requested a simpler currency policy: wallets with unset currency become USD, and all deferred currency confirmation/attestation UI and branches are removed. The owner separately approved inheriting wallet denomination for observations with unset currency and removing the separate legacy-history UI. Recorded numeric amounts, dates and results remain unchanged; historical source coverage and save times are not fabricated.

Phase 4 automated Progress rows 4.1/4.2 were reopened for verification of this revised implementation. Earlier Phase 4 gate results above describe the superseded version and are not claimed as verification of the new policy. No Phase 4 commit has been made.

### Revised implementation and verification

- Applied local additive migration `20261030140619_set_wallet_denominations.sql`: unset wallet currencies become USD; unset observation currencies inherit their owning wallet. Both columns are non-null. Removed wallet confirmation metadata and the attestation move argument. Existing denominations remain frozen; moves still require ownership and matching currency. Recorded amounts, dates, source coverage and manual save times are unchanged.
- Removed currency-attestation forms, unconfirmed-wallet runtime branches and separate legacy-history presentation. Ordinary new-wallet USD/PLN/EUR choices remain. Historical source coverage stays unknown when it was not recorded.
- The owner could not find the linking controls, so unlinked open investments now have a direct **Link stock listing** action that jumps to **Stock listing** on detail. The disabled dashboard download control explains the steps. Navigation performs no provider request.
- `npm run test:decimal-db`: PASS, 4 files / 13 tests against local PostgREST. Focused cross-surface contracts: PASS, 8 files / 54 tests. Wallet validation/currency/history and listing/move controls: PASS, 6 files / 42 tests.
- `npm run test:market-prices-db`: PASS, including USD backfill, inherited observation denominations, unchanged monetary/date/coverage facts, removal of obsolete metadata/API, frozen currency, ownership, matching-currency moves and retained price-selection/lease/cooldown rules.
- `npm run test:snapshots-db`: PASS, exact totals, concurrent idempotency, write restrictions, gaps and immutable historical values.
- Deliberately changed the worktree-only USD backfill to PLN. The disposable migration test failed with `existing unspecified wallet did not become USD`. Unconditionally restored the staged migration with `git checkout --`; the restored test passed. The broken migration was never applied to the diary database.
- Deliberately changed the dashboard listing-link destination to a missing fragment. The browser regression failed on the incorrect destination. Unconditionally restored the staged component with `git checkout --`; the final browser run passed.
- Final application static sequence: Astro sync, lint, Astro check and build PASS; 160 files, zero errors/warnings/hints. `npm test`: PASS, 33 files / 383 tests.
- Local HTTP smoke: all steps PASS. Final Chromium checks: PASS, 2 tests in 6.2 seconds, including direct dashboard-to-linking navigation without provider work, explicit downloads, retained inputs, moves and unified history. Reviewed mobile history and detail screenshots; the local dev server was refreshed after the build.

Progress 4.1/4.2 are verified for the revised application. Manual 4.3 remains pending; the owner has not approved the revised UI walkthrough. No production migration, deployment or Phase 4 commit occurred.

### Linked demo follow-up

- Owner requested a demo investment that is already linked. Fresh/reset fixtures now label the twelfth position `AAPL · Demo` and link it to owner-scoped AAPL/NMS/USD metadata. It is open, active, has quantity and has no manual price. Fresh listing rows contain no quote or refresh attempt; the loader never calls Yahoo.
- Normal reruns link only the intended older fixture while it remains open, active, unlinked and in a compatible wallet. Existing labels, manual values/save times and selected listings remain unchanged. Existing canonical listing rows are reused without overwriting saved quotes. Reset preflights unrelated position and lookup-receipt references before deleting fixture data.
- `npm run test:demo-db`: PASS, 2 tests, including real local lifecycle coverage for fresh setup, old-demo upgrade, manual facts, chosen listing, closed/deleted exclusion, cached-quote reuse, historical preservation and reset refusal. Deliberately disabled the repair branch in the worktree: the upgrade assertion failed because its link remained null. Unconditionally restored the staged loader with `git checkout --`; the restored suite passed.
- Upgraded the existing marked local demo through a normal rerun, without reset or password change. Before/after position facts matched, and the saved effective-price view verified its AAPL link on an open, non-deleted holding. No unmarked account was adopted or new persistent demo account created.
- After the demo edits, Astro sync, lint, Astro check and build passed again; the full unit suite remained 33 files / 383 tests. The local development server was refreshed after the final build.

## Phase 4 creation-flow revision — 2026-10-30

The owner did not approve manual 4.3; instead, they required Yahoo stock selection during new-investment creation and explicitly chose selecting/saving first with price downloads later from the dashboard. The plan and FR-003/FR-014 now require this flow. Phase 4 automated rows 4.1/4.2 were reopened and 4.4 added; previous checks above remain evidence for the earlier implementation only. Delegated implementation adds durable owner-scoped search targets, expiring wallet-bound choices, native search/select/save and explicit first-download verification without guessing currency/timezone.

Reviewed and applied additive migration `20261030162000_pending_stock_selections.sql` to local Supabase; generated database types came from the CLI. Existing effective-view output columns are preserved in order, with pending-selection context appended. No reset, production migration or provider quote request occurred. Creation-flow implementation and its gates are still in progress.

### Creation-flow results — 2026-11-02

- New investments require an owner/wallet-bound Yahoo search choice. Native Search and Select retain incomplete prices, dates, quantity, category, reason and broker; Save derives the canonical symbol from the stored receipt. Missing/foreign/expired/wallet-mismatched choices fail before category creation or insertion. Existing holdings retain their labels and manual support.
- Durable pending targets are separate from expiring form receipts. Search/Select/Save/read composition never request a quote. The first explicit dashboard download verifies symbol/exchange/type and actual trading currency/timezone, shares cache work across mapped/pending holdings, attaches only compatible wallets and retains incompatible manual values with persistent mismatch context.
- Applied `20261030162500_pending_listing_currency_context.sql` to expose only a verified cache denomination for pending mismatch context. Applied `20261102080240_validate_selection_without_update_privilege.sql` after the first real-transport run found that the invoker trigger's receipt `FOR SHARE` required UPDATE permission. Removing that unnecessary lock preserves caller RLS and insert-time expiry checks; receipt UPDATE grants remain denied. Applied migrations were not edited.
- Plan gates: focused contracts PASS, 9 files / 112 tests; local PostgREST/decimal/selection contracts PASS, 5 files / 14 tests. Real DB coverage includes receipt ownership/wallet/expiry, no category side effect for invalid choices, canonical symbol derivation, exclusive/expired lease recovery and late-token rejection, receipt expiry after Save, shared first-download resolution, incompatible manual preservation, cache reuse and ambiguous-identity rejection.
- `test:market-prices-db`, `test:snapshots-db`, `test:close-db`, `test:wallet-db`, `test:wallet-cron` and `test:demo-db`: PASS. Full-chain migration preservation, exact arithmetic, prior observations, ownership, source coverage, sale facts, daily scheduling and demo edits/reset safeguards remain covered. The cron metadata transaction rolled back.
- Deliberate break: removed the receipt wallet filter only in the worktree. The real DB selection test went red because a USD-wallet receipt was returned for a PLN wallet; the other 13 tests passed. Unconditionally restored the staged service using `git checkout --`; the restored full DB suite passed.
- Initial focused expectations omitted the new nullable selection fields. Added the fields to strict DTO expectations, corrected an internal target-ID fixture assumption, and retained exact equality and numeric assertions. No assertion or lint rule was disabled. Lint's volatile deadline-read and null-coalescing findings were corrected while retaining the post-await deadline check.
- Final static sequence PASS: Astro sync, lint, Astro check (164 files, zero errors/warnings/hints), Vercel build. Full unit suite PASS: 34 files / 408 tests.
- Final Chromium run PASS: setup plus four browser cases, 5 tests in 10.1 seconds. Hydrated and no-JavaScript creation use actual native Select/Save and database/SSR reads with deterministic provider-metadata receipts. They preserve draft values, retain the saved selection after reload, enable explicit download and prove no download POST on Save. Existing explicit controls/input preservation/moves and keyboard/mobile/no-JS history also passed. Provider search/page action behavior is separately covered by native-page and real DB/service tests; these checks do not claim a live Yahoo probe.
- HTTP smoke PASS, all steps, using local owner-bound metadata receipts without Yahoo requests. Authentication, native Save, exact totals, sale/delete/restore and cross-account privacy remain real.
- Reviewed selected-form, pending-dashboard and history screenshots. Added a minimum width for price context so long labels cannot squeeze it into an unreadable strip; static/unit/browser gates passed after that adjustment. Test screenshots are ignored local artifacts.

Progress 4.1, 4.2 and 4.4 are verified for the new creation flow. Manual 4.3 remains unapproved. The local app is running at `http://127.0.0.1:4321`; Phase 4 is staged but not committed. No production migration or deployment occurred.

### Manual confirmation — 2026-11-02

The owner confirmed **Manual check passed** for the revised new-investment selection/save/dashboard-download flow and Phase 4 item 4.3, including retained input, corrections, wallet moves, recoverable errors and history. All Phase 4 Progress rows are now verified. The commit is awaiting approval of its message; no production migration or deployment occurred.
