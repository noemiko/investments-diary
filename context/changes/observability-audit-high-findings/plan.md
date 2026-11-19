# Investments Diary observability implementation plan

## Overview

Address MP1 and NI1 from the observability audit dated 2026-11-19 11:58 Europe/Warsaw. Ship two independently verified phases. Keep market response contracts and successful investment saves compatible with existing callers.

## Current State Analysis

- Market search reports a synthetic error without the provider reason or status. Quote downloads retain status when available, but omit the reason and stage and can emit one event per failed listing. See `src/lib/services/market-selections.ts:86` and `src/lib/services/market-prices.ts:52,128,193`.
- Position creation treats broad SQLSTATE families as ordinary validation. The receipt guard uses `23514` for both expected receipt rejection and invariant failures. See `src/lib/services/positions.ts:40–59,247–297` and `supabase/migrations/20261102080240_validate_selection_without_update_privilege.sql:12–26`.
- The shared reporter uses the same sanitizer for platform log tags and Sentry events. Extend that boundary so both outputs carry the same safe diagnostics. See `src/lib/observability/reporter.ts:34–48` and `src/lib/observability/privacy.ts:99–114,137–151`.

## Desired End State

Market telemetry identifies the Yahoo operation, failure reason, and available HTTP status. Batch events show affected counts. An expired receipt returns the existing stock-reselection state without an event. Unexpected database rejections of otherwise valid investments produce one event that identifies the save stage and a safe invariant category.

Scope is limited to MP1 and NI1. The separate audit findings on browser capture, request correlation, skipped download work, cache identity, and snapshot scheduling remain outside this change.

## Phase 1: Preserve market provider diagnostics

### Overview

Make existing market failure reporting actionable while keeping log and event volume bounded.

### Changes Required

- **Market call sites** — `src/lib/services/market-selections.ts` and `src/lib/services/market-prices.ts`. **Intent** — Preserve the diagnostic result from search and quote calls. **Contract** — Keep `operation=marketPrices` and use provider `yahoo`, stage `listing_search`, `quote_batch`, or `listing_confirm`, and reason `invalid_request`, `invalid_quote`, `provider_unavailable`, or `timeout`. Reuse safe status when available. Preserve the original reason for reporting when the UI normalizes it. Keep `not_found` and `cancelled` quiet.
- **Batch reporting** — `src/lib/services/market-prices.ts`. **Intent** — Give responders counts without emitting once per listing. **Contract** — For a whole-batch failure, report once with the number of claimed listings. For a successful batch envelope with failed members, emit one summary per actionable reason and include only that reason’s affected count. Include a summary status only when all members in that summary share the same safe status. Preserve per-listing results, cache writes, cooldowns, and retry behavior.
- **Privacy boundary** — `src/lib/observability/{reporter,privacy}.ts`. **Intent** — Keep structured fields usable in logs and Sentry. **Contract** — Allowlist provider, stage, and reason. Accept `affected_count` only as an integer from 1 through the supported batch size of 50. Use the existing numeric status sanitizer. Exclude searches, symbols, URLs, retry timestamps, raw provider errors, and payloads from telemetry.

### Success Criteria

#### Automated Verification

- Market service and telemetry regression tests pass: `npx vitest run src/lib/services/market-prices.test.ts src/lib/services/market-selections.test.ts src/lib/observability/reporter.test.ts src/lib/observability/privacy.test.ts`
- Repository verification passes: `npx astro sync && npm run lint && npx astro check && npm run build && npm test`

#### Manual Verification

- Inspect a synthetic market event and confirm the provider, stage, reason, and count are visible without diary or provider data.

## Phase 2: Report unexpected investment save rejections

### Overview

Match the existing database signature for expected receipt rejection and report unmapped insert failures.

### Changes Required

- **Position creation** — `src/lib/services/positions.ts`. **Intent** — Keep normal reselection and missing-choice outcomes quiet while surfacing database contract failures. **Contract** — A missing receipt during the pre-read still returns `selection_invalid`. At position insert, only the exact pair `23514` and `Choose a valid stock selection for this wallet` returns `selection_invalid` quietly. A `23503` remains a quiet missing-wallet or missing-category outcome only when PostgreSQL’s reported constraint token exactly identifies the corresponding foreign key. Pin `positions_wallet_fkey` and `positions_category_id_user_id_fkey` against the local schema in the contract test. Other check or foreign-key failures use the existing `unexpected` result and emit one diagnostic. Limit the classification to the relevant insert operation so receipt and position foreign-key rules cannot suppress category-insert failures. Preserve the successful `23505` category-race retry and the behavior of edit, close, delete, restore, and wallet writes.
- **Safe diagnostic** — `src/lib/observability/{reporter,privacy}.ts`. **Intent** — Identify unexpected rejections without serializing the provider error. **Contract** — Use `operation=createPosition` with a fixed save stage, `category_insert` or `position_insert`. Use `constraint_rejection` for integrity and input conversion SQLSTATEs and `database_error` for other database failures. Retain the existing safe code allowlist and add only the specific known validation SQLSTATEs needed for this path. Unknown codes may be omitted while the event still reports. Raw messages may be inspected locally for exact classification. Exclude them, error details, form inputs, and entity IDs from telemetry.
- **Regression coverage** — `src/lib/observability/write-failures.test.ts`, `src/components/positions/new-position.test.ts`, and `tests/database/market-selections.test.ts`. **Intent** — Exercise the write race and pin the database behavior. **Contract** — Add a fast test where the receipt pre-read succeeds and the insert returns the exact rejection pair. Use the existing expired-receipt fixture to assert the trigger’s error pair through a direct authenticated insert. Exercise the named FK signatures with valid surrounding setup. Confirm the form follows its existing stock-reselection path for `selection_invalid`.

### Success Criteria

#### Automated Verification

- Investment save and telemetry regression tests pass: `npx vitest run src/lib/observability/write-failures.test.ts src/components/positions/new-position.test.ts src/lib/observability/reporter.test.ts src/lib/observability/privacy.test.ts`
- Local database contract tests pass with the local Supabase stack running: `npm run test:decimal-db`
- Repository verification passes: `npx astro sync && npm run lint && npx astro check && npm run build && npm test`

#### Manual Verification

- Confirm a rejected receipt returns the form to stock selection and preserves the other draft fields.

## Testing Strategy

- **Market:** Test upstream HTTP failure, timeout, listing confirmation, expected absence and cancellation, and a mixed batch with two invalid quotes, one absent listing, and one success. Expect one invalid-quote summary with count `2`. Assert stable public results and verify safe fields in both captured and scrubbed output.
- **Investment:** Test the exact receipt signature, the same code with another message, the same message with another code, known and unknown FK errors, and successful or raced category creation. Assert one report for unexpected rejections and zero for expected rejects. Use a sanitized fixture to verify that raw database text cannot reach the log or Sentry.
- **Deliberate break checks:** In Phase 1, temporarily drop the provider reason or bypass aggregation and confirm the focused regression test fails. In Phase 2, temporarily restore broad `23514` suppression and confirm the unexpected-rejection test fails. Restore each change before repository checks and the phase commit.
- Use the existing local development environment for builds and the local Supabase stack for database verification. Manual rows stay pending for human review and do not block automated phase commits.

## Performance Considerations

Aggregation uses the existing batch results and makes no additional provider or database calls. Save classification operates on the insert result.

## Migration Notes

Use the current database signatures. Deployment and rollback are application-only. The local integration test pins the existing guard signature so a future change to its wording requires explicit coordination.

## References

- [Audit findings MP1 and NI1](../../audits/observability/2026-11-19_market-prices-wallet-snapshots-new-investments.md)
- [Change record](change.md)
- [Repository verification sequence](../../../.claude/skills/verify/SKILL.md)

## Progress

> Check completed automated rows here and append their phase commit SHA. Leave manual rows unchecked for human review.

### Phase 1: Preserve market provider diagnostics

#### Automated

- [x] 1.1 Market service and telemetry regression tests pass: `npx vitest run src/lib/services/market-prices.test.ts src/lib/services/market-selections.test.ts src/lib/observability/reporter.test.ts src/lib/observability/privacy.test.ts`
- [x] 1.2 Repository verification passes: `npx astro sync && npm run lint && npx astro check && npm run build && npm test`

#### Manual

- [ ] 1.3 Inspect a synthetic market event and confirm the provider, stage, reason, and count are visible without diary or provider data.

### Phase 2: Report unexpected investment save rejections

#### Automated

- [ ] 2.1 Investment save and telemetry regression tests pass: `npx vitest run src/lib/observability/write-failures.test.ts src/components/positions/new-position.test.ts src/lib/observability/reporter.test.ts src/lib/observability/privacy.test.ts`
- [ ] 2.2 Local database contract tests pass with the local Supabase stack running: `npm run test:decimal-db`
- [ ] 2.3 Repository verification passes: `npx astro sync && npm run lint && npx astro check && npm run build && npm test`

#### Manual

- [ ] 2.4 Confirm a rejected receipt returns the form to stock selection and preserves the other draft fields.
