# Record the First Investment Implementation Plan

## Overview

Let the signed-in author record an investment — instrument, per-share buy price and buy date
required; quantity and broker label optional — with a reason category (picked or created
inline) and an optional reason text, and see it in a private, newest-first list of their
positions. This is roadmap slice S-01 (`record-first-investment`), covering FR-003, FR-004,
FR-005 (define and assign) and FR-010, and it is the first time the app stores diary data.
Every later slice (price and result, confrontation, closing, delete, lock, category editing)
builds on the schema introduced here.

## Current State Analysis

- Auth works end to end: sign-up, sign-in, sign-out, and a middleware guard that redirects
  anonymous requests for any path starting with `/dashboard` (`src/middleware.ts:4`,
  `src/middleware.ts:14`).
- No diary data exists: there is no `supabase/migrations/` directory, no generated database
  types and no `src/types.ts`. The Supabase client is untyped (`src/lib/supabase.ts:13`).
- `/dashboard` is a placeholder welcome card (`src/pages/dashboard.astro`).
- There is no test framework. The verification bar is the `verify` skill (astro sync, lint,
  astro check, build) plus `scripts/smoke.mjs`, a zero-dependency HTTP walk that CI runs
  against a local Supabase stack (`.github/workflows/ci.yml` `smoke` job).
- Registration is open (PRD Open Question 3, resolved 2026-09-25), so any stranger can hold
  an account. Nothing today proves one account cannot read another's rows.
- `astro/zod` is exported by the installed `astro` package, so validation needs no new
  dependency.

## Desired End State

A signed-in author opens `/dashboard/new`, fills instrument, price and date (date defaults to
today), picks one of their categories or types a new one, optionally writes a reason, and
saves. They land on `/dashboard`, which lists all their positions newest buy date first, each
row showing instrument, buy date, buy price, quantity, broker and category. A fresh account
sees an explanatory empty state with a link to record the first investment. A second account
sees none of the first account's positions or categories and cannot attach a position to the
first account's category — proven on every PR by the CI smoke walk.

Verify by: the three phases' success criteria below, ending with a green CI `smoke` job that
includes the new isolation steps.

### Key Discoveries:

- `/migration` project skill (`.claude/skills/migration/SKILL.md`) defines the table template
  (`user_id` FK to `auth.users`, RLS on, granular per-operation policies, `deleted_at`) and
  requires the migration to state where the reason lock is enforced.
- `context/deployment/deploy-plan.md` §5 and `infrastructure.md` risk register: every schema
  change needs a tested down-path before it ships, a migration never ships in the same deploy
  as the feature that uses it, and `npx supabase db push` to production is human-only.
- Auth forms post natively and redirect with `?error=` (`src/pages/api/auth/signup.ts:13`);
  CLAUDE.md asks new forms to keep the native-POST pattern.
- Astro components render layout; `.tsx` components need a `client:*` directive
  (`src/pages/auth/signin.astro:14` pattern). `FormField` (`src/components/auth/FormField.tsx`)
  is the existing input component.
- Middleware matches by prefix (`startsWith`), so every page under `/dashboard/` is gated
  without editing `PROTECTED_ROUTES`.

## What We're NOT Doing

- Position detail view, current price and result (S-02).
- The confrontation before saving (S-03).
- Closing, deleting/restoring, editing positions or the reason lock mechanism (S-04, S-05,
  S-07). No update path for any column is built here.
- Renaming or removing categories, or a categories management page (S-08).
- Gating pages outside `/dashboard` (S-06).
- Currencies, broker records, averaging several buys into one holding.
- Introducing a unit/integration test framework (decided: extend the smoke walk instead).
- Applying the migration to production from the agent session (human-only).

## Implementation Approach

Vertical slice in three phases, ordered by the deploy rules. Phase 1 ships only the schema
(plus down-script, generated types and a typed client), so the human can push the migration
to production before any code depends on it. Phase 2 adds the user-facing flow: a zod
validation schema, a small service layer that always runs through the request-scoped,
RLS-bound Supabase client, the `/dashboard/new` form page and the rebuilt `/dashboard` list.
Phase 3 turns the privacy guardrail into an automated check by extending the smoke walk with
a second account.

Decisions settled during planning:

| Decision | Choice |
| --- | --- |
| Buy price | Per-share price; total = price × quantity only when quantity is given |
| Same instrument bought twice | Two separate positions, each with its own reason |
| Category creation | Pick an existing category or type a new one inside the entry form |
| Buy date | Defaults to today; any past date accepted; future dates rejected |
| Privacy proof | Extend `scripts/smoke.mjs` with a second account, run by the CI `smoke` job |
| Form handling | `/dashboard/new` handles its own POST and re-renders with values on error |
| Hard delete | No DELETE policy on either table; soft delete arrives with S-05 / S-08 |
| Category names | Unique per user, case-insensitive, among non-deleted categories |
| Number input | Accept `,` or `.` as decimal separator; must be greater than 0 |
| List order | Buy date descending, then creation time descending |

## Critical Implementation Details

- **Reason text must never travel in a URL.** The auth pattern redirects errors via query
  string; reusing it here would have to echo submitted values (including the reason) into
  the URL, which lands in Vercel request logs. That is why the form page handles its own POST
  and re-renders instead of redirecting on error.
- **Category ownership is not covered by RLS alone.** The `positions` insert policy only
  checks `positions.user_id = auth.uid()`; a plain FK on `category_id` would accept another
  user's category id. The composite FK `(category_id, user_id) → reason_categories(id, user_id)`
  is what closes this, and Phase 3 tests it directly.
- **Deploy order.** Phase 1 must be merged *and* pushed to the production database by the
  human before Phase 2 is merged to `master` (auto-deploy on merge). Preview deployments use
  the same Supabase project (deploy-plan open decision 1, recommendation (b)), so a Phase 2
  preview writes to production tables.

## Phase 1: Data model

### Overview

Create the two diary tables with owner-only access, a tested down-script, generated types and
a typed Supabase client. No user-visible change.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<UTC YYYYMMDDHHmmss>_create_diary_core.sql` (scaffold with `/migration create_diary_core`)

**Intent**: Introduce `reason_categories` and `positions`, owned per user, following the
`/migration` template, so S-01 can store entries and later slices can extend them.

**Contract**:
- `reason_categories`: `id uuid pk`, `user_id uuid not null → auth.users on delete cascade`,
  `name text not null` (trimmed, 1–60 chars), `created_at`, `deleted_at timestamptz null`;
  `unique (id, user_id)` (target of the composite FK); unique index on
  `(user_id, lower(name)) where deleted_at is null`.
- `positions`: `id uuid pk`, `user_id` (as above), `instrument text not null` (1–100),
  `buy_price numeric(20,8) not null check > 0` (per share), `buy_date date not null`,
  `quantity numeric(20,8) null check > 0`, `broker_label text null` (≤ 60),
  `category_id uuid not null`, `reason_text text null` (≤ 10 000), `created_at`,
  `deleted_at timestamptz null`; composite FK below; index on `(user_id, buy_date desc)`.
- RLS enabled on both. Policies per table: `select`, `insert`, `update` for `authenticated`
  with `auth.uid() = user_id` (update has both `using` and `with check`). **No delete policy**
  on either table. No policy for `anon`.
- Header comment states: the reason lock (FR-008) is enforced in S-07; this migration creates
  no update path for `reason_text` in application code. Future-date rejection is enforced in
  application code, not a check constraint (a `current_date` check is not stable).

```sql
foreign key (category_id, user_id)
  references public.reason_categories (id, user_id)
```

#### 2. Down-script

**File**: `supabase/rollbacks/<same timestamp>_create_diary_core.down.sql`

**Intent**: Provide the tested down-path the deploy rules require, stored outside
`supabase/migrations/` so the CLI never applies it automatically.

**Contract**: Drops `positions` then `reason_categories` (policies and indexes go with them).
Header comment warns it destroys all diary rows and is for rollback before real data exists
only.

#### 3. Generated database types

**File**: `src/db/database.types.ts`

**Intent**: Make the schema the single source of types, per tech-stack.md's "typed from the
database through to the interface".

**Contract**: Output of `npx supabase gen types typescript --local > src/db/database.types.ts`.
Regenerate whenever a migration changes. Excluded from hand edits.

#### 4. Typed client

**File**: `src/lib/supabase.ts`

**Intent**: Parameterise the server client with the generated `Database` type so queries are
typed. Keep the existing dev-host guard and non-empty checks unchanged.

**Contract**: `createClient(...)` returns `SupabaseClient<Database>`.

### Success Criteria:

#### Automated Verification:

- Local database rebuilds with the migration: `npx supabase db reset`
- RLS is on and exactly six policies exist (select/insert/update × 2 tables, none for delete), shown by the `/migration` skill's `pg_class` / `pg_policies` queries
- Down-script round trip succeeds locally: apply the down-script with `psql`, confirm both tables are gone, then `npx supabase db reset` again
- Generated types are current: regenerating `src/db/database.types.ts` produces no diff
- `verify` skill sequence passes (astro sync, lint, astro check, build)

#### Manual Verification:

- Human runs `npx supabase db push` against production and confirms in Studio that both tables exist with RLS enabled, before Phase 2 is merged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Record and list

### Overview

The user-facing flow: validation, service layer, entry form with inline category picker, and
the positions list with an empty state.

### Changes Required:

#### 1. Domain types

**File**: `src/types.ts`

**Intent**: Shared DTOs for the pages and the service, derived from the generated types (per
CLAUDE.md, this file is created when the domain model lands).

**Contract**: `ReasonCategory` (`id`, `name`), `PositionListItem` (instrument, buy date, buy
price, quantity, broker label, category name), `NewPositionInput` (parsed form values).

#### 2. Validation

**File**: `src/lib/validation/position.ts`

**Intent**: One zod schema (from `astro/zod`) that parses the raw form into `NewPositionInput`
and yields per-field messages the form can show.

**Contract**:
- Required: `instrument` (trimmed, 1–100), `buy_price` (> 0), `buy_date` (valid date, not
  after today), and exactly one of `category_id` (uuid) or `new_category_name` (trimmed, 1–60).
- Optional: `quantity` (> 0), `broker_label` (≤ 60), `reason_text` (≤ 10 000); empty strings
  become `null`.
- Numbers: strip spaces, accept a single `,` or `.` decimal separator; reject anything else
  with "Enter a number like 50.25".
- "Today" for the future-date check is the server's current UTC date.

#### 3. Service

**File**: `src/lib/services/positions.ts`

**Intent**: Keep data access out of pages. Every function takes the request-scoped client
from `createClient`, so RLS applies; the service-role key is never used.

**Contract**:
- `listCategories(client)` — the author's non-deleted categories, ordered by name.
- `listPositions(client)` — non-deleted positions with category name, ordered
  `buy_date desc, created_at desc`.
- `createPosition(client, userId, input)` — when `new_category_name` is given, find the
  author's category by case-insensitive name or create it (on a unique-violation race,
  re-select); then insert the position. Returns the new id, or a typed error: `validation`,
  `category_not_found` (FK violation, i.e. an id that is not the author's), or `unexpected`.
  An orphan category left by a failed position insert is acceptable.

#### 4. Entry form page

**File**: `src/pages/dashboard/new.astro`

**Intent**: Render the form on GET; on POST, parse → create → redirect to `/dashboard` on
success, or re-render with the submitted values and field errors on failure (no values in the
URL — see Critical Implementation Details).

**Contract**: Form fields `instrument`, `buy_price`, `buy_date`, `category_id`,
`new_category_name`, `reason_text`, `quantity`, `broker_label`. `category_not_found` shows
"Choose a category from your list". Astro's origin check stays on (the smoke walk already
sends `Origin`).

#### 5. Form island

**File**: `src/components/positions/PositionForm.tsx`

**Intent**: Native `<form method="POST">` with client-side checks mirroring the schema, as in
`SignInForm.tsx`. Field order serves the 60-second NFR: instrument (autofocus), buy price, buy
date (default today), category, reason, then quantity and broker label.

**Contract**: Props `categories: ReasonCategory[]`, `values`, `errors`. The category control
lists existing categories plus a "New category…" choice that reveals a text input; it submits
exactly one of `category_id` / `new_category_name`. Rendered with `client:load`. Reuses
`FormField` where it fits.

#### 6. Positions list

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the placeholder with the author's positions list (FR-010), keeping the
page's visual style and the sign-out control.

**Contract**: Table columns: instrument, buy date, buy price, quantity, broker, category.
Numbers formatted with `Intl.NumberFormat`, no currency. Empty state: a sentence explaining
that positions and their reasons appear here, plus a "Record your first investment" link to
`/dashboard/new`. A "New investment" link is always visible when the list is not empty.

### Success Criteria:

#### Automated Verification:

- `verify` skill sequence passes (astro sync, lint, astro check, build)
- Existing smoke walk still passes against the local stack: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- On a fresh account, `/dashboard` shows the empty state and its link opens the form
- Recording a first investment with a new inline category, from opening the diary to the saved list, takes under 60 seconds
- A second entry can pick the category created by the first, and the list shows both newest buy date first with their categories
- Submitting with a future date, a zero price or no category shows the field error and keeps every typed value, including the reason
- A price typed as `50,25` is saved and displayed as 50.25

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Privacy proof

### Overview

Extend the smoke walk so CI proves, on every PR, that one account cannot see or borrow
another account's diary data.

### Changes Required:

#### 1. Smoke walk

**File**: `scripts/smoke.mjs`

**Intent**: Add a second account and diary steps while keeping the script zero-dependency and
the existing auth steps intact.

**Contract**:
- `request()` also returns the response body text; cookie jars become per-account.
- Steps for account A: sign up and sign in, see the empty state, POST `/dashboard/new` with a
  run-unique instrument and a new run-unique category (expect 302 → `/dashboard`), see the
  instrument in the list, read the new category's id from the `/dashboard/new` HTML.
- Steps for account B: sign up and sign in; the list does not contain A's instrument; the form
  does not offer A's category; POST `/dashboard/new` with A's `category_id` returns 200 with
  the "Choose a category from your list" error, and B's list still has no positions.
- Validation step: a future buy date returns 200 with the date error, not a redirect.
- Anonymous POST to `/dashboard/new` redirects to `/auth/signin`.

#### 2. Commands documentation

**File**: `CLAUDE.md` (Commands → `npm run smoke`)

**Intent**: The entry says the walk proves the auth flow; update it to say it also proves
cross-account isolation and creates two accounts per run.

**Contract**: One-line edit to the existing bullet.

### Success Criteria:

#### Automated Verification:

- Extended smoke walk passes locally against the local stack: `BASE_URL=http://localhost:4321 npm run smoke`
- CI `smoke` job is green on the pull request
- `verify` skill sequence passes (astro sync, lint, astro check, build)

**Implementation Note**: After completing this phase and all automated verification passes, confirm with the human before closing the change.

---

## Testing Strategy

### Unit Tests:

- None — the repo has no unit test framework and this plan deliberately does not add one.
  Validation rules are exercised through the smoke walk and manual checks.

### Integration Tests:

- `scripts/smoke.mjs` (Phase 3): two-account isolation, foreign-category insert rejection,
  future-date rejection, anonymous POST redirect.
- RLS and policy inspection queries plus the down-script round trip (Phase 1).

### Manual Testing Steps:

1. Fresh account → empty state → record first investment with a new category, timed.
2. Second investment reusing the category; check list order and columns.
3. Invalid submissions (future date, zero price, missing category) keep all values.
4. Comma decimal input.

## Performance Considerations

Single user, small data. The `(user_id, buy_date desc)` index matches the only list query; no
pagination in this slice.

## Migration Notes

First migration in the project. Ships alone in Phase 1; the human pushes it to production with
`npx supabase db push` before Phase 2 merges. The down-script is valid only before real
entries exist; once the author has data, rollback means a code-only `vercel rollback` (the
additive tables are harmless to older code).

## References

- Roadmap item: `context/foundation/roadmap.md` → S-01
- PRD: `context/foundation/prd.md` (FR-003, FR-004, FR-005, FR-010, NFRs)
- Migration template: `.claude/skills/migration/SKILL.md`
- Deploy rules: `context/deployment/deploy-plan.md` §5–6, `context/foundation/infrastructure.md` risk register
- Form pattern: `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`
- Smoke walk: `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model

#### Automated

- [ ] 1.1 Local database rebuilds with the migration: `npx supabase db reset`
- [ ] 1.2 RLS is on and exactly six policies exist (select/insert/update × 2 tables, none for delete), shown by the `/migration` skill's `pg_class` / `pg_policies` queries
- [ ] 1.3 Down-script round trip succeeds locally: apply the down-script with `psql`, confirm both tables are gone, then `npx supabase db reset` again
- [ ] 1.4 Generated types are current: regenerating `src/db/database.types.ts` produces no diff
- [ ] 1.5 `verify` skill sequence passes (astro sync, lint, astro check, build)

#### Manual

- [ ] 1.6 Human runs `npx supabase db push` against production and confirms in Studio that both tables exist with RLS enabled, before Phase 2 is merged

### Phase 2: Record and list

#### Automated

- [ ] 2.1 `verify` skill sequence passes (astro sync, lint, astro check, build)
- [ ] 2.2 Existing smoke walk still passes against the local stack: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual

- [ ] 2.3 On a fresh account, `/dashboard` shows the empty state and its link opens the form
- [ ] 2.4 Recording a first investment with a new inline category, from opening the diary to the saved list, takes under 60 seconds
- [ ] 2.5 A second entry can pick the category created by the first, and the list shows both newest buy date first with their categories
- [ ] 2.6 Submitting with a future date, a zero price or no category shows the field error and keeps every typed value, including the reason
- [ ] 2.7 A price typed as `50,25` is saved and displayed as 50.25

### Phase 3: Privacy proof

#### Automated

- [ ] 3.1 Extended smoke walk passes locally against the local stack: `BASE_URL=http://localhost:4321 npm run smoke`
- [ ] 3.2 CI `smoke` job is green on the pull request
- [ ] 3.3 `verify` skill sequence passes (astro sync, lint, astro check, build)
