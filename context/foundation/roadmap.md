---
project: "Investments Diary"
version: 1
status: draft                    # draft | active | locked
created: 2026-09-25
updated: 2026-10-16
prd_version: 1
main_goal: learn
top_blocker: decisions
milestone_id: first-honest-diary
milestone_seq: 1
milestone_status: open           # open | done
---

# Roadmap: Investments Diary

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First honest diary** — Status: open

- **Intent:** The author can record every position they hold with the reason they bought it, follow each position's result, and — before saving a new investment — see how their earlier investments made for the same reason turned out.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-012, US-01, the four PRD Non-Functional Requirements.

## Vision recap

A private investor forgets why they bought what they own, so they repeat the same wrong
decisions; broker summaries record numbers, never reasons. Investments Diary records the
reason next to each position and, at the moment of a new buy, shows the author their own
earlier positions bought for the same reason together with how they turned out. The
product's core hypothesis — the bet the whole product rests on — is that being confronted
with your own past reasoning at the moment of deciding improves how you invest.

## North star

**S-03: Author sees earlier same-reason positions and their results before saving a new investment** — this is the moment no portfolio tracker offers, and the one the PRD's Business Logic exists to deliver.

> "North star" here means the smallest end-to-end slice whose successful delivery would
> prove the core hypothesis. It is placed as early as its Prerequisites allow, because
> everything else only matters if this works.

## At a glance

| ID   | Change ID                  | Outcome (user can …)                                                                 | Prerequisites | PRD refs                        | Status   |
| ---- | -------------------------- | ------------------------------------------------------------------------------------ | ------------- | ------------------------------- | -------- |
| S-01 | record-first-investment    | record an investment with a reason category and optional reason, and see it listed   | —             | FR-003, FR-004, FR-005, FR-010  | done |
| S-02 | position-detail-and-price  | open a position, read its full reason, update its price and see its dated result     | S-01          | FR-006, FR-011                  | done |
| S-03 | reason-confrontation       | see earlier same-reason positions with their results before saving a new investment  | S-01, S-02    | US-01, FR-012                   | proposed |
| S-04 | close-position             | close a position with sell price and date and see its final result                   | S-02          | FR-007                          | proposed |
| S-05 | recoverable-delete         | delete a position and restore it later                                               | S-01          | FR-009                          | proposed |
| S-06 | private-diary-access       | register and reach only their own diary, with every diary page gated behind sign-in  | —             | FR-001, FR-002                  | ready    |
| S-07 | reason-lock-editing        | correct an investment's facts and add a missing reason, after which the reason locks | S-01          | FR-008, FR-004                  | proposed |
| S-08 | evolve-reason-categories   | rename a reason category everywhere, or remove it while past positions keep it       | S-01          | FR-005                          | proposed |

## Baseline

What's already in place in the codebase as of `2026-09-25` (auto-researched + user-confirmed).
Slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 + React 19 + Tailwind 4 with shared layout and UI components (`src/layouts/Layout.astro`, `src/components/ui/`).
- **Backend / API:** partial — server endpoints exist only for auth (`src/pages/api/auth/`); no diary endpoints.
- **Data:** partial — database client wired (`src/lib/supabase.ts`) and local database config present (`supabase/config.toml`); no migrations and no diary tables.
- **Auth:** present — sign-up, sign-in, sign-out and route protection for `/dashboard` (`src/middleware.ts`). Open registration is currently enabled (`supabase/config.toml` → `enable_signup = true`).
- **Deploy / infra:** present — production live at `https://investments-diary.vercel.app`; CI runs lint, type check, build and a smoke test against a local database (`.github/workflows/ci.yml`). Remaining human gates are tracked in `context/deployment/deploy-plan.md`.
- **Observability:** absent — no error tracking, logging library or analytics.

## Foundations

None for this milestone. Frontend, auth and deploy are present in the Baseline. The one
partial layer that matters — diary data and its owner-only access rules — is introduced
inside S-01, the first slice that stores anything, and extended by each later slice that
needs more. A separate data foundation would build tables ahead of any user-visible use,
which is exactly what this roadmap avoids.

## Slices

### S-01: Record the first investment

- **Outcome:** user can record an investment (instrument, buy price and buy date required; quantity and broker label optional), attach a reason category they defined and an optional reason text, and see it in their list of positions with its category.
- **Change ID:** record-first-investment
- **PRD refs:** FR-003, FR-004, FR-005 (define and assign categories), FR-010; NFR recording under 60 seconds; NFR reason visible only to its author
- **Prerequisites:** —
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:**
  - Is back-filling an already-held position just a normal entry with a past buy date, or does it need its own flow? (PRD Open Question 4) — Owner: user. Block: no.
  - How does the reason lock interact with the reason being optional? (PRD Open Question 1) — Owner: user. Block: no (this slice stores the reason but offers no editing; the lock lands in S-07).
- **Risk:** Goes first because every other slice reads the data it creates, and it is where the owner-only access rule and the first table are learned — the least familiar part of the stack, per `main_goal: learn`. What could go wrong: the entry form grows past the 60-second budget; keep optional fields out of the way.
- **Status:** done

### S-02: Read a position and keep its price current

- **Outcome:** user can open one position, read its full written reason, update its current price, and see its result together with the date that price was set — in the detail view and in the list.
- **Change ID:** position-detail-and-price
- **PRD refs:** FR-006, FR-011; NFR every result states its price date
- **Prerequisites:** S-01
- **Parallel with:** S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Acceptance criteria for the price-update path are missing (PRD Open Question 4) — Owner: user. Block: no (write them during `/10x-plan`).
- **Risk:** Sequenced before the confrontation because "result" does not exist until a current price does; without it S-03 would show positions with nothing to judge them by.
- **Status:** done

### S-03: Confrontation before saving a new investment

- **Outcome:** user can, while recording a new investment and after choosing its reason category, see every earlier position of theirs in that category with its reason text and current result — or an explanatory empty state — before the entry is saved.
- **Change ID:** reason-confrontation
- **PRD refs:** US-01, FR-012
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-04, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The north star; placed as soon as a result exists. What could go wrong: it drifts into a verdict or score — the PRD forbids any recommendation, so it must present history only.
- **Status:** proposed

### S-04: Close a position

- **Outcome:** user can close an open position by recording sell price and sell date, and from then on see its final gain or loss wherever results are shown, including the confrontation once S-03 has landed.
- **Change ID:** close-position
- **PRD refs:** FR-007
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Acceptance criteria for the closing path are missing (PRD Open Question 4) — Owner: user. Block: no (write them during `/10x-plan`).
- **Risk:** Builds on the result concept from S-02; kept separate from it because a long-term investor rarely sells and this path should not delay the north star.
- **Status:** proposed

### S-05: Delete and restore a position

- **Outcome:** user can delete a position, which disappears from the list and the confrontation, and restore it later.
- **Change ID:** recoverable-delete
- **PRD refs:** FR-009; NFR no entry disappears without confirmation and any removed entry can be restored
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Independent of the result path, so it can run alongside it. What could go wrong: hidden entries still leak into the confrontation or the list; the restore path must be verified, not assumed.
- **Status:** proposed

### S-06: Private access to the diary

- **Outcome:** user can register an account (registration stays open), reach every diary page only when signed in, sign out from anywhere, and see only their own diary — no other account and no signed-out visitor can read any part of it.
- **Change ID:** private-diary-access
- **PRD refs:** FR-001, FR-002; NFR no other account and no unauthenticated visitor can read any part of a position
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-05, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Sign-up mode — resolved 2026-09-25: open registration (PRD Open Question 3).
  - What does a signed-out visitor see on a gated page? Assumed: redirect to sign-in, as the current route protection does for `/dashboard` — confirm during `/10x-plan`. Owner: user. Block: no.
- **Risk:** Sign-in already works (Baseline). With open registration, privacy rests entirely on every diary page being gated and every position being readable only by its owner, so this slice extends route protection beyond `/dashboard` to all diary pages. It must land before real positions go into production.
- **Status:** ready

### S-07: Correct facts, lock the reason

- **Outcome:** user can correct an investment's prices, dates, quantity and broker label at any time, and add a reason to an entry saved without one; the written reason stops being editable shortly after it is first entered.
- **Change ID:** reason-lock-editing
- **PRD refs:** FR-008, FR-004
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:**
  - Can a rushed entry saved without a reason be completed later — resolved 2026-09-25: yes; the lock window starts when the reason is first written, not when the entry is created (PRD Open Question 1).
- **Risk:** The lock is what keeps the diary honest; starting it at the first written reason means rushed entries are never stranded without one, while written reasoning still cannot be softened after the outcome is known.
- **Status:** proposed

### S-08: Evolve reason categories

- **Outcome:** user can rename a reason category, and the new name shows everywhere, past positions included; and user can remove a category, which is soft-deleted, so past positions still show its name marked as removed.
- **Change ID:** evolve-reason-categories
- **PRD refs:** FR-005 (edit the list)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - What happens to past entries on rename or removal — resolved 2026-09-25: rename updates the name everywhere; removal is a soft delete and past positions show the name with a "removed" marker (PRD Open Question 2).
  - Is a removed category still offered when recording a new investment, and can it be restored? — Owner: user. Block: no (settle during `/10x-plan`).
- **Risk:** The confrontation groups history by category; because rename keeps the same category and removal only hides it, earlier positions never lose their grouping.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                    | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------- | -------------------------------------------------------- | --------------------- | ----- |
| S-01       | record-first-investment   | Record an investment with reason and list positions       | yes                   | Run `/10x-plan record-first-investment` |
| S-02       | position-detail-and-price | Position detail view with manual price and dated result   | no                    | Waits on S-01 |
| S-03       | reason-confrontation      | Show same-reason history before saving a new investment   | no                    | North star; waits on S-01, S-02 |
| S-04       | close-position            | Close a position and show final result                    | no                    | Waits on S-02 |
| S-05       | recoverable-delete        | Delete and restore a position                             | no                    | Waits on S-01 |
| S-06       | private-diary-access      | Gate every diary page and keep each diary owner-only      | yes                   | Run `/10x-plan private-diary-access` |
| S-07       | reason-lock-editing       | Edit investment facts with a locked reason                | no                    | Waits on S-01 |
| S-08       | evolve-reason-categories  | Rename and soft-remove reason categories                  | no                    | Waits on S-01 |

## Open Roadmap Questions

1. ~~**How does the reason lock interact with the reason being optional?**~~ — Resolved 2026-09-25: an entry saved without a reason can have one added later; the lock starts when the reason is first written. See S-07.
2. ~~**What happens to past entries when a reason category is renamed or removed?**~~ — Resolved 2026-09-25: rename updates the name everywhere; removal is a soft delete and past positions show the name marked as removed. See S-08.
3. ~~**Sign-up behaviour and unauthenticated-visitor handling**~~ — Resolved 2026-09-25: open registration. Signed-out visitors on a gated page are assumed to be redirected to sign-in (confirm in S-06).
4. **User stories for the remaining paths** — only the confrontation path has acceptance criteria. Back-filling an existing holding, updating a price and closing a position do not. Owner: user. Block: none (resolved per slice during `/10x-plan` for S-01, S-02, S-04).
5. **Live price source as a later addition** — recorded as a secondary success criterion and an explicit non-goal for version one. Owner: user. Block: none.

## Parked

- **Declared strategy to judge buys against** — Why parked: PRD §Non-Goals; deliberately held back so it cannot grow into the first version unnoticed.
- **Live price source** — Why parked: PRD §Non-Goals; manual price entry is the first-version path (see Open Roadmap Question 5).
- **Brokers as managed records** — Why parked: PRD §Non-Goals; a broker stays a text label.
- **Sharing with anyone else** — Why parked: PRD §Non-Goals; the diary is private by construction.
- **Error tracking and logging** — Why parked: Baseline reports it absent, but no PRD requirement depends on it for a single-user diary.

## Milestone History

## Done

- **S-01: user can record an investment (instrument, buy price and buy date required; quantity and broker label optional), attach a reason category they defined and an optional reason text, and see it in their list of positions with its category.** — Archived 2026-10-02 → `context/archive/2026-09-25-record-first-investment/`. Lesson: —.
- **S-02: user can open one position, read its full written reason, update its current price, and see its result together with the date that price was set — in the detail view and in the list.** — Archived 2026-10-16 → `context/archive/2026-10-15-position-detail-and-price/`. Lesson: —.
