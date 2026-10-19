<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Named Wallets

- **Plan**: context/changes/named-wallets/plan.md
- **Scope**: Full plan, including explicitly requested category cancellation and hiding the redundant wallet member column
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Scope and evidence

Reviewed the current uncommitted working tree, including tracked modifications and untracked feature files; there is no feature commit range to attribute. Both the plan-drift review and independent safety/pattern review covered all three phases. Latest UI changes were explicitly requested by the user and are authorized scope.

Ownership/backfill, the composite wallet foreign key, deletion protection, request-scoped queries, error handling, shared calculations, member isolation, deterministic position batching and CI unit-test execution match the plan. No critical security or data-safety issue found.

Progress is 16/16 checked, including five manual items. Manual checkboxes were changed outside this review; this review preserves them and does not claim independent browser, keyboard, mobile-width or timed-entry verification. The existing change notes still describe manual acceptance as pending; those notes predate the updated Progress.

## Verification

- `npm test`: PASS, 27 tests across 3 files.
- `npm run lint`: PASS.
- `npx astro check`: PASS, 0 errors/warnings/hints across 71 files.
- `npm run build`: PASS. Existing environment warning: local Node 26, Vercel runtime Node 24.
- `npm run test:wallet-db`: PASS, isolated temporary database fixtures cover backfill, authenticated ownership, validation and hard/soft deletion restrictions.
- `BASE_URL=http://localhost:4321 npm run smoke`: PASS, all HTTP steps including anonymous/cross-account access, assignment, membership, edits, duplicates, validation retention, deletion/restoration and diary-wide confrontation.
- `git diff --check`: PASS.

The initial HTTP attempt against 127.0.0.1:4321 failed with ECONNREFUSED; the running server is reachable through localhost. Database and HTTP verification required access outside the sandbox. No production operation, source fix, commit or deployment was performed during this review.

## Findings

### F1 — Wallet enumeration still truncates at the API row cap

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/wallets.ts:27–34; supabase/config.toml:18
- **Detail**: Unlike position reads, listWallets issues one unpaginated query. The configured API maximum is 1,000 rows, while wallet creation has no corresponding limit. Authors with more than 1,000 wallets will silently lose later wallets from the summary and investment-entry selector. This does not affect normal small-wallet usage or weaken RLS, but leaves enumeration incomplete at extreme scale.
- **Fix**: Reuse readAll for listWallets with name then id ordering; add a capped-response regression covering more than 1,000 wallets.
- **Decision**: PENDING
