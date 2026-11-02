# Close Public Sign-up Implementation Plan

## Overview

Replace open registration with owner-created accounts (roadmap S-10, owner decision 2026-11-02). Nobody can
create an account from the app or by calling the public Supabase Auth sign-up API. The owner creates accounts
with a repo script that targets the local stack by default and the hosted project only on an explicit,
confirmed request. Existing accounts keep signing in and out as before.

## Current State Analysis

- **The PRD still promises open registration.** FR-001 reads "User can create an account and sign in"
  (`context/foundation/prd.md:98`), Access Control says "Sign-up: open registration (resolved 2026-09-25)"
  (`prd.md:248`), and Open Question 3 is resolved as open registration (`prd.md:276`). CLAUDE.md requires every
  domain behaviour to trace to an `FR-NNN`, so the PRD moves first.
- **App sign-up is four files.** `src/pages/api/auth/signup.ts` (POST, `supabase.auth.signUp` with
  `emailRedirectTo=/auth/callback`, success → `/auth/confirm-email`), `src/pages/auth/signup.astro`,
  `src/components/auth/SignUpForm.tsx`, and `src/pages/auth/confirm-email.astro`, whose only entry is
  `signup.ts:23`.
- **Links to it:** `src/components/Welcome.astro:35-40`, `src/components/Topbar.astro:27-29`,
  `src/pages/auth/signin.astro:14-19`.
- **Shared helpers stay.** `FormField`, `ServerError`, `SubmitButton` are also used by `SignInForm.tsx` and
  `PositionForm.tsx`; `PasswordToggle` by `SignInForm.tsx`.
- **Observability allowlist** names sign-up: operation `"auth.signUp"` (`src/lib/observability/privacy.ts:26`) and
  routes `/auth/signup`, `/auth/confirm-email`, `/api/auth/signup` (`privacy.ts:80,82,84`). The expected code
  `"signup_disabled"` (`src/lib/observability/auth.ts:11`) stays — a refused sign-up is not an incident.
- **`/auth/callback` was reached only from sign-up's confirmation link** (`src/pages/auth/callback.ts:5-9`). Its
  code (`exchangeCodeForSession` → `/dashboard` or `/auth/signin?error=`) works without sign-up; its comment and
  `LINK_FAILED` text ("sign up again") do not. Roadmap S-10 keeps the callback.
- **Tests that break:** `src/lib/observability/auth.test.ts:7` imports `POST as signUp` from the endpoint (test at
  `:49-70`, handler entry `:80-86`). `src/lib/observability/middleware.test.ts:57,66` uses `/auth/signup` only as
  an arbitrary route.
- **`npm run smoke`** (`scripts/testing/smoke.mjs`) signs up both accounts over HTTP (`:284-288` for A,
  `:526-530` for B). It already discovers `SERVICE_ROLE_KEY` via `supabase status -o json` behind a local-only
  guard (`:21-30`) and has a `fixtureJson` REST helper (`:32-45`). The CI `smoke` job uses the local
  `config.toml`, so it inherits any Auth change.
- **Local Auth config:** `supabase/config.toml:169` `[auth] enable_signup = true`, `:204` `[auth.email]
  enable_signup = true`. Anonymous (`:171`) and SMS (`:242`) sign-up are already off.
- **Admin user creation already exists** in the demo seeder (`scripts/demo/seed-demo.mjs`,
  `scripts/demo/lib/demo-data.mjs:19-24` `assertLocal`, `:180-201` `admin.auth.admin.createUser` with
  `email_confirm: true`), the database tests and two Playwright specs. The Supabase CLI has no user-creation
  command.
- **Production:** `context/deployment/deploy-plan.md` gap 1 (`:45-50`, HIGH, open), B3 (`:136`, human: create
  account, disable "Allow new users to sign up", delete stray accounts), E5 (`:165`). No production service-role
  key exists anywhere today; Supabase Auth settings are human-only (`:110-115`, `:214-215`). The owner's own
  production account already exists (owner, this planning session).

## Desired End State

- `POST <supabase>/auth/v1/signup` with the anon key returns `422` (`signup_disabled`) locally and in production.
- `/auth/signup`, `/api/auth/signup` and `/auth/confirm-email` return 404; no page links to sign-up.
- `npm run user:create -- --email <e>` creates a confirmed email/password account on local Supabase;
  `npm run user:create -- --production --url https://<ref>.supabase.co --email <e>` does the same on the hosted
  project after hidden-input key entry and a typed project-ref confirmation.
- `npm run smoke` creates its two accounts with the admin API, proves both refusals above, and keeps every
  existing sign-in, isolation and sign-out check green.
- PRD, deploy-plan, README, CLAUDE.md, test-plan and roadmap baseline describe owner-created accounts.

### Key Discoveries:

- Admin creation is unaffected by `enable_signup = false` (GoTrue `DISABLE_SIGNUP` gates only the public
  `/auth/v1/signup`); the seeder pattern (`seed-demo.mjs:6-13`) is the template for the local path.
- Config changes need `npx supabase stop && npx supabase start` to take effect locally.
- `vitest.config.ts` includes `scripts/**/__tests__/*.test.ts`, so script logic is unit-testable with `npm test`.

## What We're NOT Doing

- No invite / magic-link flow, password reset, or set-password page; accounts get a password at creation.
- No redirect from `/auth/signup`; an old link gets the normal 404.
- No admin UI in the app, and no service-role key in Vercel, `.env`, `.env.local` or `astro.config.mjs`.
- No account update, password reset or deletion through the script; it only creates.
- No change to sign-in, sign-out, middleware or `PROTECTED_ROUTES`.
- No agent action against the hosted Supabase project; the dashboard switch and any production script run are
  the owner's.
- Historical documents (`context/archive/`, `context/audits/`, `shape-notes.md`) are left as written.

## Implementation Approach

Decision first, then the replacement path, then removal: the PRD and deploy-plan record the change (phase 1),
the owner's creation script exists and is tested (phase 2) before anything closes, then the app and local Auth
close together with smoke reworked in the same phase so CI never goes red between them (phase 3). The hosted
switch is a human gate (phase 4); because the owner's production account already exists, there is no lock-out
ordering constraint, and the switch may land before or after the deploy.

## Critical Implementation Details

- **Production key handling.** The production service-role key is read only from a hidden TTY prompt — never
  from argv, environment variables or any file — so it stays out of shell history and dotfiles. The production
  path refuses to run without a TTY. Neither the key nor the password is ever printed or logged.
- **Target guard.** Without `--production` the script must refuse any non-local URL (reuse `assertLocal`). With
  `--production` it must refuse anything but `https://<ref>.supabase.co` and require the owner to type `<ref>`
  before any request. Never infer production from an env var.
- **Smoke ordering.** Admin-created accounts must exist before the "signin rejects wrong password" step; the
  two refusal checks go where the old sign-up steps were.

## Phase 1: Record the decision

### Overview

Amend the product and deployment documents so the code change traces to an FR and the new secret has a policy.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: Replace open registration with owner-created accounts.

**Contract**: FR-001 becomes "User can sign in to an account the owner created; nobody can create an account
from the app or the public Auth API (amended 2026-11-02)", with a Socrates note recording the decision. Access
Control "Sign-up" paragraph rewritten to owner-created accounts. Open Question 3 resolution updated, keeping the
2026-09-25 history visible as superseded.

#### 2. Deploy plan

**File**: `context/deployment/deploy-plan.md`

**Intent**: Point gap 1, B3 and E5 at this change and add the run-time-key policy.

**Contract**: Gap 1 references `close-public-signup`; B3 drops "create your account through `/auth/signup`"; E5
checks the Auth API refusal (`422 signup_disabled`) instead of the deleted form. New short subsection: the
production service-role key is owner-only, copied from the dashboard at run time into the script's hidden
prompt, never stored in any file, env var or Vercel, and agents never run `user:create --production`.

### Success Criteria:

#### Automated Verification:

- `grep -n "open registration" context/foundation/prd.md` shows only text marked superseded
- `npx prettier --check context/foundation/prd.md context/deployment/deploy-plan.md` passes

#### Manual Verification:

- Owner confirms the FR-001 and Access Control wording matches the decision

**Implementation Note**: After automated verification passes, pause for the owner's confirmation before phase 2.

---

## Phase 2: Owner account script

### Overview

Give the owner a create-only account path for local and hosted Supabase, before sign-up closes.

### Changes Required:

#### 1. Pure logic

**File**: `scripts/accounts/lib/create-user.mjs` (new)

**Intent**: Hold the testable decisions: argument parsing, target resolution and guards, password validation,
existing-account refusal.

**Contract**: Exports `parseArgs(argv)` → `{ email, production, url }` (rejects unknown flags, missing
`--email`, `--url` without `--production` and vice versa); `resolveTarget({ production, url, localApiUrl })`
→ `{ origin, projectRef | null }` (local: `assertLocal` from `scripts/demo/lib/demo-data.mjs`; production:
`https:` and hostname `<ref>.supabase.co` only); `validatePassword(pw)` (minimum 12 characters, as the seeder);
`createOwnerUser(admin, { email, password })` that refuses an existing email (paged `listUsers`, as the seeder)
and calls `admin.auth.admin.createUser({ email, password, email_confirm: true })`, returning the email only.

#### 2. Entry point

**File**: `scripts/accounts/create-user.mjs` (new), `package.json`

**Intent**: Wire prompts and credentials to the logic.

**Contract**: `npm run user:create -- --email <e> [--production --url https://<ref>.supabase.co]`. Local:
credentials from `npx supabase status -o json` (as `seed-demo.mjs:6-13`). Production: refuse without a TTY;
hidden prompt for the service-role key; prompt to type `<ref>` to confirm. Both: hidden password prompt entered
twice. Prints `Created <email> on <local|project ref>` and nothing else sensitive.

#### 3. Tests

**File**: `scripts/accounts/__tests__/create-user.test.ts` (new)

**Intent**: Prove the guards that keep production safe.

**Contract**: Cases: local mode rejects `https://x.supabase.co` and `http://127.0.0.1.evil.test`; production
mode rejects `http://`, non-`supabase.co` hosts and `x.supabase.co.evil.test`; flag combinations; short
password; existing email refused without calling `createUser`; `createUser` receives `email_confirm: true`.

#### 4. Docs

**File**: `scripts/README.md`, `README.md`

**Intent**: Document the command, the hidden-key rule and that agents never run the production mode.

**Contract**: New `accounts/` row in the folder table and a usage section; README "creating an account" replaces
the sign-up instructions.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including `scripts/accounts/__tests__/create-user.test.ts`
- `npm run lint` passes
- `npm run user:create -- --email owner-check@example.com` creates a confirmed user on local Supabase, and a
  second run with the same email is refused

#### Manual Verification:

- Signing in at `/auth/signin` with the script-created local account reaches `/dashboard`
- Running with `--production --url https://example.supabase.co` asks for the key with hidden input and stops
  at the ref confirmation when a wrong ref is typed (no request made)

**Implementation Note**: After automated verification passes, pause for the owner's confirmation before phase 3.

---

## Phase 3: Close sign-up in the app, local Auth and smoke

### Overview

Remove every app path to sign-up, close it at the local Auth layer, and keep CI green by moving smoke onto
admin-created accounts.

### Changes Required:

#### 1. Delete sign-up

**File**: `src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`, `src/components/auth/SignUpForm.tsx`,
`src/pages/auth/confirm-email.astro`

**Intent**: Remove the app's sign-up flow and its dead confirmation page.

**Contract**: Files deleted; the four routes return Astro's 404.

#### 2. Links and callback wording

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`, `src/pages/auth/signin.astro`,
`src/pages/auth/callback.ts`

**Intent**: No page advertises sign-up; the callback no longer tells users to sign up.

**Contract**: Sign-up button/links/paragraph removed (sign-in kept). Callback comment describes it as the
landing route for Supabase email links; `LINK_FAILED` no longer mentions signing up.

#### 3. Observability allowlist

**File**: `src/lib/observability/privacy.ts`

**Intent**: Drop allowlist entries for things that no longer exist.

**Contract**: Remove operation `"auth.signUp"` and routes `/auth/signup`, `/auth/confirm-email`,
`/api/auth/signup`. Keep `/auth/callback`, sign-in/sign-out entries, and `"signup_disabled"` in `auth.ts`.

#### 4. Unit tests

**File**: `src/lib/observability/auth.test.ts`, `src/lib/observability/middleware.test.ts`

**Intent**: Tests compile and still cover sign-in, sign-out and callback.

**Contract**: Remove the sign-up import, its test and its `handlers` entry (and the now-unused `signUp` mock
fields). Replace `/auth/signup` in the middleware concurrency test with another existing route.

#### 5. Local Auth config

**File**: `supabase/config.toml`

**Intent**: Close sign-up at the Auth layer locally and in CI.

**Contract**: `[auth] enable_signup = false` and `[auth.email] enable_signup = false`.

#### 6. Smoke

**File**: `scripts/testing/smoke.mjs`

**Intent**: Create the two accounts through the admin API and prove both refusals.

**Contract**: Accounts A and B created with `POST /auth/v1/admin/users` (`{ email, password, email_confirm:
true }`) via `fixtureJson` before their first sign-in step. The old "signup creates account" steps become: A —
`POST /api/auth/signup` → `404`; B — `POST /auth/v1/signup` on local Supabase with the anon key → `422` with
`signup_disabled`. Header comment and step names updated. All later steps unchanged.

#### 7. Docs

**File**: `README.md`, `CLAUDE.md`, `scripts/README.md`, `context/foundation/test-plan.md`,
`context/foundation/roadmap.md`

**Intent**: Stop describing sign-up as a feature.

**Contract**: README auth-routes table and stale "Email confirmation in local development" section; CLAUDE.md
smoke description and `{signin,signup,signout}` path list, and the env note about confirmations; scripts README
smoke row; test-plan risk #3 wording ("open registration"), the "sign-up floods" note and the smoke row; roadmap
Baseline "Auth" line. Do not change roadmap item statuses (the skills own those).

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `npx astro sync && npm run lint` passes
- `npx astro check` passes
- `npm run build` passes
- After `npx supabase stop && npx supabase start`, `npm run smoke` passes against `npm run dev`, including the
  `404` and `422 signup_disabled` checks
- `grep -rniE "signup|sign-up|sign up" src/` returns only `signup_disabled` and the callback/observability
  references that intentionally remain
- `npm run test:decimal-db` still passes (its users are admin-created)

#### Manual Verification:

- Home page and top bar show only "Sign in" when signed out
- An existing local account signs in, reaches `/dashboard` and signs out
- The PR's CI run is green for `ci` and `decimal-transport`; `smoke` is green after merge

**Implementation Note**: After automated verification passes, pause for the owner's confirmation before phase 4.

---

## Phase 4: Production gate

### Overview

The owner closes sign-up on the hosted project and confirms nothing is locked out. Agents run nothing here
beyond read-only checks that deploy-plan already allows.

### Changes Required:

#### 1. Hosted Auth setting (human)

**File**: Supabase dashboard → Authentication → Sign In / Providers; `context/deployment/deploy-plan.md`

**Intent**: Close the real gate and record it.

**Contract**: "Allow new users to sign up" off; stray accounts in Authentication → Users reviewed and deleted;
deploy-plan gap 1 marked fixed with the date.

### Success Criteria:

#### Manual Verification:

- A public sign-up request against the hosted project (anon key, `POST /auth/v1/signup`) returns `422
  signup_disabled`
- After the phase 3 deploy, `https://investments-diary.vercel.app/auth/signup` returns 404 and the owner signs
  in, opens `/dashboard` and signs out
- Authentication → Users lists only accounts the owner recognises
- (Optional) `npm run user:create -- --production --url https://<ref>.supabase.co --email <throwaway>` creates
  a confirmed user, which the owner then deletes in the dashboard

---

## Testing Strategy

### Unit Tests:

- `scripts/accounts/__tests__/create-user.test.ts`: target guards (local and production lookalike hosts), flag
  parsing, password length, existing-account refusal, `email_confirm: true`.
- `src/lib/observability/auth.test.ts`: still covers sign-in, sign-out and callback after the sign-up removal.

### Integration Tests:

- `npm run smoke`: admin-created accounts, both refusals, and every existing isolation check.

### Manual Testing Steps:

1. Create a local account with `npm run user:create`, sign in, reach `/dashboard`, sign out.
2. Visit `/auth/signup` locally: 404.
3. Production: the phase 4 checks.

## Migration Notes

No database migration. Existing accounts are untouched. Rollback is reverting the PR and turning the hosted
switch back on; neither loses data.

## References

- Roadmap item: `context/foundation/roadmap.md` S-10
- Deploy plan: `context/deployment/deploy-plan.md` gap 1, B3, E5
- Admin creation pattern: `scripts/demo/seed-demo.mjs:6-13`, `scripts/demo/lib/demo-data.mjs:19-24,180-201`
- Smoke helpers: `scripts/testing/smoke.mjs:21-45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Record the decision

#### Automated

- [x] 1.1 `grep -n "open registration" context/foundation/prd.md` shows only text marked superseded
- [x] 1.2 `npx prettier --check context/foundation/prd.md context/deployment/deploy-plan.md` passes

#### Manual

- [x] 1.3 Owner confirms the FR-001 and Access Control wording matches the decision

### Phase 2: Owner account script

#### Automated

- [ ] 2.1 `npm test` passes, including `scripts/accounts/__tests__/create-user.test.ts`
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `npm run user:create -- --email owner-check@example.com` creates a confirmed user on local Supabase, and a second run with the same email is refused

#### Manual

- [ ] 2.4 Signing in at `/auth/signin` with the script-created local account reaches `/dashboard`
- [ ] 2.5 Running with `--production --url https://example.supabase.co` asks for the key with hidden input and stops at the ref confirmation when a wrong ref is typed (no request made)

### Phase 3: Close sign-up in the app, local Auth and smoke

#### Automated

- [ ] 3.1 `npm test` passes
- [ ] 3.2 `npx astro sync && npm run lint` passes
- [ ] 3.3 `npx astro check` passes
- [ ] 3.4 `npm run build` passes
- [ ] 3.5 After `npx supabase stop && npx supabase start`, `npm run smoke` passes against `npm run dev`, including the `404` and `422 signup_disabled` checks
- [ ] 3.6 `grep -rniE "signup|sign-up|sign up" src/` returns only `signup_disabled` and the callback/observability references that intentionally remain
- [ ] 3.7 `npm run test:decimal-db` still passes (its users are admin-created)

#### Manual

- [ ] 3.8 Home page and top bar show only "Sign in" when signed out
- [ ] 3.9 An existing local account signs in, reaches `/dashboard` and signs out
- [ ] 3.10 The PR's CI run is green for `ci` and `decimal-transport`; `smoke` is green after merge

### Phase 4: Production gate

#### Manual

- [ ] 4.1 A public sign-up request against the hosted project (anon key, `POST /auth/v1/signup`) returns `422 signup_disabled`
- [ ] 4.2 After the phase 3 deploy, `https://investments-diary.vercel.app/auth/signup` returns 404 and the owner signs in, opens `/dashboard` and signs out
- [ ] 4.3 Authentication → Users lists only accounts the owner recognises
- [ ] 4.4 (Optional) `npm run user:create -- --production --url https://<ref>.supabase.co --email <throwaway>` creates a confirmed user, which the owner then deletes in the dashboard
