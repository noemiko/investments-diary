---
change_id: test-plan-refresh-2026-11-20
title: Refresh test strategy for privacy and past investment reasons
status: archived
created: 2026-11-20
updated: 2026-11-20
archived_at: 2026-11-20T15:11:49Z
---

## Notes

Work in xdev10/investments-diary.
Open a refresh change for context/foundation/test-plan.md using this accepted brief.

Purpose: reconcile the October strategy with shipped protection and current requirements, then plan only missing protection. Do not implement tests during change creation.

User evidence:
- Top concerns: "data leaking and do not showing past decisions during creating investment".
- Explicit priority: an E2E test showing reasons of previous investments while creating an investment.
- No past incidents reported; no frequently changed area feels uncertain.
- Keep the existing test-plan exclusions. Do not add new exclusions without agreement.

Risk response intent:
1. Privacy: anonymous visitors and account B must neither read nor change account A's diary. Ground direct database, API and page boundaries; inspect existing ownership/grant contracts before adding tests. Prefer real database and targeted HTTP checks. Avoid mocked RLS and read-only happy paths.
2. Decision history: before saving a new investment, selecting a reason category reveals the author's matching past investments and their written reasons. Prioritize browser interaction coverage, including category switching and empty results. Ground eligibility rules in PRD US-01/FR-012 and existing tests. Use distinctive independent fixture text; avoid status-only assertions. Database tests separately prove membership and ownership.
3. Financial results: protect net commissions, denomination, effective price selection and freshness per FR-003/007/013-016. Verify existing unit/rendering/database protection; expected values must be independently calculated.
4. Persistence: delete/restore and wallet reassignment preserve required fields; later changes do not rewrite saved observations. Ground allowed mutations in FR-009/013/016. Check persisted state, not just responses.
5. Environment parity: reconcile migrations-from-zero, production-like grants, ownership, hosted auth and actual CI wiring. Do not infer branch protection or hosted parity from local passes.

Discovery evidence:
- Guide last updated 2026-10-21 and strategy reviewed 2026-10-16; result correctness still marked implementing although archived plan Progress is fully checked.
- Meaningful suite: 57 test/setup files across application, database, browser and scripts (inventory, not execution evidence).
- Playwright config and context/foundation/test-stack.md exist; browser serving uses build then Astro dev and does not prove deployed runtime parity.
- CI includes npm test, review script tests, static/build checks and local database contracts on qualifying PRs; HTTP smoke is master-push-only; this workflow does not run Playwright.
- Database consolidation is archived; wallet dashboard verification retains pending human acceptance. Archive location alone does not prove all manual checks passed.
- New PRD surface includes commissions, automatic prices, wallet currency, immutable daily observations and wallet moves.
- Confirmed hot-spot scopes: src/, supabase/migrations/, scripts/, excluding docs, tests, fixtures, generated types and build output. Scan found 32 eligible commits in the 30 days to 2026-11-20; leading dirs: src/pages/dashboard (10), scripts/testing/database (10), src/lib/services (9). Churn is likelihood evidence, not failure-location proof.
- Current-session tools checked 2026-11-20: Exa search and browser control exposed; Context7 and project provider MCPs not exposed. No new tooling recommended and no external API guidance verified.

Proposed rollout:
1. Reconcile shipped protection, stale rollout statuses, current suites/gates and evidence-backed gaps.
2. Protect private decision history: uncovered ownership checks plus the requested browser scenario.
3. Close verified financial/persistence gaps only.
4. Align justified gates and cookbook patterns with actual execution.

Read current test-plan.md, PRD, roadmap, test-stack.md, package/configs, relevant archived verification and applicable repository instructions. Research must locate real failure paths and existing assertions before planning. Apply cost × signal; do not duplicate working protection, invent missing safeguards, or copy expected values from production logic.
The refresh plan's final phase updates rollout status and cookbook patterns. Do not rewrite strategy/risk sections (§1/§2) without explicit user direction.
After change creation suggest the next natural /10x-research invocation, then continue the normal research → plan → implement handoffs.

