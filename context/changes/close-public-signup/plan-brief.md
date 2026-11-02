# Close Public Sign-up — Plan Brief

> Full plan: `context/changes/close-public-signup/plan.md`

## What & Why

Anyone holding the app URL or the public anon key can create an account in this private financial diary today.
The owner decided on 2026-11-02 (roadmap S-10) to replace open registration with owner-created accounts:
nobody can sign up from the app or the public Auth API, and the owner creates accounts with their own script.

## Starting Point

The app has a sign-up page, form, endpoint and confirmation page, linked from the home page, top bar and sign-in
page. `supabase/config.toml` allows sign-up, and the hosted project's "Allow new users to sign up" is still on
(deploy-plan gap 1, HIGH). `npm run smoke` creates its two accounts by signing up over HTTP. The PRD still says
"open registration".

## Desired End State

A public sign-up request returns `422 signup_disabled` locally and in production, and `/auth/signup` is a 404.
The owner runs `npm run user:create` to create a confirmed email/password account on local Supabase, or on the
hosted project with `--production` after entering the service-role key in a hidden prompt. Smoke creates its
accounts through the admin API and proves both refusals. Existing accounts sign in and out unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Close at which layer | Auth layer (local config + hosted switch) and app UI | Removing the page alone leaves `/auth/v1/signup` open to anyone with the anon key | Roadmap S-10 |
| Owner creation path | One script, local by default, `--production` on explicit request | One repeatable path for every environment | Plan |
| Production key handling | Hidden TTY prompt only; never argv, env, file or Vercel; agents never run it | Keeps a new high-privilege secret out of history and dotfiles | Plan |
| Production target guard | `https://<ref>.supabase.co` only, owner types `<ref>` to confirm | Stops a lookalike or mistyped URL before any request | Plan |
| First credential | Email + password with `email_confirm: true` | Matches the seeder and tests; needs no email delivery | Plan |
| Script scope | Create only; refuses an existing email | No update/reset path to misuse | Plan |
| Old `/auth/signup` URL | Plain 404 | Least code; nothing advertises how to get an account | Plan |
| `/auth/confirm-email` | Deleted | Its only entry was the sign-up endpoint | Research |
| `/auth/callback` | Kept, wording fixed | Roadmap keeps it; it no longer tells users to sign up | Roadmap S-10 |
| Rollout order | No lock-out gate needed | Owner's production account already exists | Plan |

## Scope

**In scope:** PRD (FR-001, Access Control, OQ3) and deploy-plan amendments; `npm run user:create` with unit
tests; deleting the four sign-up files and three links; observability allowlist cleanup; both `enable_signup`
flags off; smoke on admin-created accounts with two refusal checks; doc updates; the hosted switch (owner).

**Out of scope:** invite/magic-link, password reset, set-password page, account update or deletion via script,
an admin UI, a redirect from `/auth/signup`, any service-role key in Vercel or `.env`, agent actions on the
hosted project.

## Architecture / Approach

`scripts/accounts/lib/create-user.mjs` holds the testable logic (argument parsing, target guard, password check,
existing-account refusal, `admin.auth.admin.createUser`). `scripts/accounts/create-user.mjs` gets credentials
from `supabase status` (local, as the demo seeder does) or from hidden prompts (production). Smoke reuses its
existing local service-role helper to call `POST /auth/v1/admin/users`. Supabase's `enable_signup = false`
blocks only the public sign-up endpoint, so admin creation keeps working everywhere.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Record the decision | PRD and deploy-plan describe owner-created accounts and the key policy | Wording drifts from the decision |
| 2. Owner account script | `npm run user:create`, local and guarded production modes, tested | A guard gap lets the script hit the wrong project |
| 3. Close sign-up | Sign-up gone from app and local Auth; smoke reworked; docs updated | Smoke or a unit test left on the old flow turns CI red |
| 4. Production gate | Hosted switch off, stray accounts removed, refusals verified (owner) | Switch forgotten, leaving the API open |

**Prerequisites:** local Supabase (Docker); owner access to the Supabase dashboard; owner's production account
(exists).
**Estimated effort:** ~2 sessions across 3 agent phases, plus ~15 minutes of owner dashboard work.

## Open Risks & Assumptions

- `enable_signup = false` returning `422 signup_disabled` and leaving `admin.createUser` working is Supabase
  behaviour from documentation knowledge; phase 3's smoke run is the first local proof.
- The production mode is exercised only by the owner (optional phase 4 check); unit tests cover its guards.
- The production key passes through the owner's terminal session; the hidden prompt keeps it out of history,
  not out of memory of that process.

## Success Criteria (Summary)

- A public sign-up attempt is refused by Supabase Auth, locally and in production, and no page links to sign-up.
- The owner can create a confirmed account with one command, and that account signs in.
- CI (`ci`, `decimal-transport`, `smoke`) stays green.
