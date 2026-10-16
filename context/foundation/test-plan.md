# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-16

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   author is worried the displayed result is quietly wrong, and the failure
   would surface wherever a result is shown" carry the same weight as PRD
   lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Expected values come from an independent source — the PRD, a hand-computed
example, or the interview — never from the implementation under test.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`,
`scripts/` (excluding generated `src/db/database.types.ts`, `.astro/`, `dist/`,
`node_modules/`, `context/`). 26 in-scope commits in the 30 days to 2026-10-16.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                   | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A position's displayed result (percent, amount, sign, price date) is silently wrong — rounding, comma-decimal parsing, precision loss, or a date that is not the date of the price used — and the author decides on a false number. | High   | High       | interview Q1; PRD NFR "every displayed result states the date of the price"; PRD FR-006; archive `2026-10-15-position-detail-and-price`; hot-spot dirs `src/lib/validation/` (5 commits/30d), `src/components/positions/` (12 commits/30d); roadmap S-03 reuses the result in the confrontation |
| 2   | The confrontation shows the wrong history: another account's positions, deleted positions, other categories, or misses a matching one; or shows a blank area instead of the empty state.                  | High   | High       | PRD US-01 acceptance criteria; PRD FR-012; roadmap S-05 risk "hidden entries still leak into the confrontation"; roadmap S-03 in flight                                                                                   |
| 3   | Abuse: under open registration, a second account reads or changes another account's position or category by id (view, price update, delete, restore), or a new table ships without per-operation RLS and its rows are readable. | High   | Medium     | PRD Access Control and privacy guardrail; CLAUDE.md RLS tripwire ("a missing policy fails silently"); roadmap S-06; roadmap S-04, S-07, S-08 add schema                                                                    |
| 4   | A migration applies cleanly on the incrementally migrated local database but behaves differently in production (RLS, column defaults).                                                                    | High   | Medium     | interview Q2; archive `2026-10-15-recoverable-delete` follow-up F9b (needs a migration); hot-spot dir `supabase/migrations/` (2 commits/30d) with further schema slices on the roadmap                                     |
| 5   | Auth wiring drifts between local and hosted: a confirmation or redirect URL points at the wrong origin, or the callback fails to exchange its code, and the author is locked out of the diary.             | High   | Medium     | interview Q2; archive `2026-10-14-auth-email-callback`; hot-spot dir `src/pages/api/auth/` (3 commits/30d)                                                                                                                 |
| 6   | Silent data loss: a deleted position cannot be restored, comes back altered, or an update overwrites fields it should not touch.                                                                           | High   | Medium     | PRD guardrail "no silent data loss"; PRD FR-009; archive `2026-10-15-recoverable-delete` (rollback note, follow-up F9b)                                                                                                    |

High-impact × low-likelihood scenarios kept out of this map: a Vercel or
Supabase outage, and sign-up floods on open registration. Both belong to
observability and platform configuration (rate limits), not tests.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                          | Must challenge                                                                                   | Context `/10x-research` must ground                                                                                     | Likely cheapest layer                         | Anti-pattern to avoid                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| #1   | Hand-computed expected results for gain and loss sign, two-decimal rounding edges, `,` vs `.` input, 8-decimal precision, an unpriced position, and a shown price date equal to the date of the price used. | "It looked right on the dashboard, so the arithmetic is right."                                  | Where the result is computed and formatted; every surface that displays it (list, detail, confrontation); input parsing | unit                                          | Oracle problem — expected value computed with the production formula instead of written out by hand     |
| #2   | With two real accounts' data: only the author's own, non-deleted, same-category positions appear; the empty state appears when none match.                                                              | "The list already filters deleted rows, so the confrontation does too."                          | The query behind the confrontation, its filters, and the RLS policies it relies on                                      | integration against local Supabase            | Mocking the Supabase client, so no filter or policy ever executes                                        |
| #3   | Account B receives nothing and changes nothing for every operation on account A's ids, verified at the database/RLS level and not only over HTTP.                                                     | "Redirect to sign-in means the data is private" and "RLS enabled means every operation is covered." | Per-operation, per-role policies; every mutation entry point that takes an id                                            | integration with two real sessions            | Testing only reads, or only one account's happy path                                                     |
| #4   | A database built from zero out of every migration applies cleanly, and the #3 ownership tests pass on it, in CI on every pull request.                                                                 | "Works on my local stack means works in production."                                             | How migrations are applied locally, in CI, and in production; defaults and triggers that differ between them             | CI gate plus a manual pre-production check    | Running tests against an incrementally migrated development database                                     |
| #5   | Confirmation and redirect URLs are built from the request's origin, and the callback turns a valid code into a session or fails with a clean error, not a silent drop.                                 | "Supabase handles it" — that tests the library, not this project's wiring (§7).                  | How redirect URLs are built; the callback route; hosted auth settings that live outside the repo                         | integration plus a manual hosted checklist    | Asserting Supabase internals, or hardcoding a localhost origin                                           |
| #6   | A delete-then-restore round trip returns the position with every field unchanged; an edit leaves untouched fields exactly as they were.                                                                 | "A success response means the row is intact."                                                    | Soft-delete columns, the restore path, which fields each update writes                                                  | integration                                   | Checking only the response status, not the persisted row                                                 |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                   | Goal (one line)                                                                                                                         | Risks covered  | Test types                             | Status      | Change folder |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------- | ----------- | ------------- |
| 1   | Result correctness           | Bootstrap the unit runner in CI and prove every displayed result matches independent hand-computed values, including its price date    | #1             | unit                                   | not started | —             |
| 2   | Private data integration     | Prove confrontation membership, cross-account ownership on every operation, and an intact delete/restore round trip against real local Supabase | #2, #3, #6     | integration                            | not started | —             |
| 3   | Environment parity           | Prove migrations apply from zero with ownership intact on every pull request, and auth redirects and callback hold under hosted-like settings | #4, #5         | CI gate, integration, manual checklist | not started | —             |
| 4   | Quality gates and agent loop | Lock the floor: unit tests at edit time through an agent hook, integration and parity gates required on pull requests                    | cross-cutting  | hook, gates                            | not started | —             |

Order rationale: #1 is the top risk at the cheapest layer, and the runner it
installs unblocks every later phase. Phase 2 reuses that runner with a real
database. Phase 3 runs Phase 2's ownership tests on a database built from
zero. Phase 4 wires what exists by then.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

Test-base profile (2026-10-16): **none** — no test-runner config, 0 test
files. The only automated check is the HTTP smoke walk `scripts/smoke.mjs`
(auth flow and cross-account isolation), run by CI on push to `master` only.

| Layer               | Tool                                                  | Version            | Notes                                                                                                   |
| ------------------- | ----------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| unit + integration  | Vitest (via Astro's `getViteConfig`, per `health-check.md`) | 5.0.5 (npm latest, checked: 2026-10-16) | none yet — see Phase 1; integration reuses it in Phase 2                                                 |
| database            | Supabase CLI local stack                              | from `devDependencies` (`supabase` ^2.23) | Real Postgres + RLS for integration tests; never the hosted project                                      |
| HTTP smoke          | `scripts/smoke.mjs` (zero-dependency)                 | n/a                | Existing; runs against a live dev server; creates two accounts per run — never point it at production    |
| e2e (browser)       | not planned                                           | n/a                | Server-rendered flows are covered more cheaply by HTTP smoke plus integration; revisit via `--refresh`   |

**Stack grounding tools (current session):**

- Docs: none (no Context7 or framework-docs MCP exposed) — Vitest/Astro setup to be checked against `docs.astro.build` and `vitest.dev` during Phase 1 research; checked: 2026-10-16
- Search: built-in web search only (no Exa.ai MCP) — not used for this plan; checked: 2026-10-16
- Runtime/browser: none (no Playwright MCP exposed) — not used; checked: 2026-10-16
- Provider/platform: GitHub MCP present but not authorized; no Supabase or Vercel MCP — not used; checked: 2026-10-16

Use docs MCPs for current framework/library APIs and setup details. Use
search MCPs for discovery or current status only, then prefer official docs
as the evidence. Do not use MCP docs/search to infer code failure anchors;
those belong in per-phase `/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                        | Where                     | Required?                    | Catches                                              |
| ------------------------------------------- | ------------------------- | ---------------------------- | ---------------------------------------------------- |
| lint + `astro check` + build                | pre-commit (lint) + CI    | required (wired)             | syntactic / type drift, broken build                 |
| HTTP smoke walk                             | CI on push to `master`    | required (wired)             | broken auth flow, cross-account leaks over HTTP      |
| unit tests                                  | local + CI on PR          | required after §3 Phase 1    | wrong result arithmetic, parsing, formatting         |
| integration tests against local Supabase    | CI on PR                  | required after §3 Phase 2    | wrong confrontation set, ownership gaps, data loss   |
| migrations from zero + ownership tests      | CI on PR                  | required after §3 Phase 3    | schema and RLS drift between environments            |
| hosted auth and schema checklist            | between merge and prod    | required after §3 Phase 3    | settings that live outside the repo                  |
| post-edit unit-test hook                    | local (agent loop)        | recommended after §3 Phase 4 | regressions at edit time                             |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 for the result-correctness pattern (hand-computed expected values, never derived from the formula under test).

### 6.2 Adding an integration test against local Supabase

- TBD — see §3 Phase 2 for the two-account ownership and confrontation-membership pattern.

### 6.3 Adding a test for a new table or migration

- TBD — see §3 Phase 3 for the migrations-from-zero plus per-operation ownership pattern.

### 6.4 Adding a test for an auth-adjacent route

- TBD — see §3 Phase 3 for the redirect-origin and callback-failure pattern.

### 6.5 Per-rollout-phase notes

(Appended by each phase's final sub-phase.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **`/dev/kitchen-sink` and UI-token styling** — visual polish, checked by eye. Re-evaluate if tokens start carrying meaning (e.g. gain/loss colour is the only signal). (Source: Phase 2 interview Q5.)
- **Pixel or snapshot tests of the dashboard** — break on every restyle and catch nothing. Re-evaluate if a rendering regression reaches production unnoticed. (Source: Phase 2 interview Q5.)
- **Supabase auth internals** — trust the library; test this project's wiring around it. Re-evaluate if the pre-1.0 `@supabase/ssr` pin changes behaviour on upgrade. (Source: Phase 2 interview Q5.)
- **Reason lock (S-07) and category rename/removal (S-08)** — not built yet; testing them now means inventing code. Add risks via `--refresh` when they ship. (Source: Phase 3 challenger pass.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-16
- Stack versions last verified: 2026-10-16
- AI-native tool references last verified: 2026-10-16

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
