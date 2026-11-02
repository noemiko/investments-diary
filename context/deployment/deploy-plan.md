---
project: investments-diary
planned_at: 2026-09-24
platform: Vercel (Hobby)
production_url: https://investments-diary.vercel.app
inputs:
  - context/foundation/infrastructure.md (researched_at 2026-09-23)
  - context/foundation/tech-stack.md
status: approved-pending-human-gates
---

# Deploy Plan: first production deploy

This is the plan for the first official production deploy. It also records what was
supposed to happen. Every step names its **owner**: `agent` (runs from the session with
CLI or git), `human` (panel or decision, never delegated), or `agent → human`
(the agent prepares the step and a human approves it).

For the current stock-price schema, use the [stock-price release and recovery section](#stock-price-release-and-recovery). Its maintenance transition and schema-compatible recovery supersede the historical no-migration/down-migration assumptions below. Hosted schema changes and production promotion remain human-controlled; local verification is not hosted release evidence.

## 1. State at planning time (checked 2026-09-24)

Most of the Getting Started section in `infrastructure.md` is already done. Plan against
the real state, not the checklist:

| infrastructure.md step               | State                              | Evidence                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. git + GitHub remote               | ✅ done                            | `origin` = `github.com/noemiko/investments-diary`, 3 commits, clean tree                                                                                                                                                                  |
| 2. Remove Cloudflare adapter         | ✅ done                            | no `@astrojs/cloudflare` or `wrangler` in `package.json`, no `wrangler.jsonc`                                                                                                                                                             |
| 3. Vercel adapter                    | ✅ done                            | `@astrojs/vercel` ^11.0.11, `import vercel from "@astrojs/vercel"` (no `/serverless`)                                                                                                                                                     |
| 4. `optional: false` in env schema   | ✅ done                            | `astro.config.mjs`: both fields are `optional: false`                                                                                                                                                                                     |
| 5. Link + secrets                    | ⚠️ partial                         | `.vercel/project.json` is linked (`prj_HMLj…`). Whether the env vars are scoped to Production, Preview or both is **unverified**                                                                                                          |
| 6. Deploy                            | ⚠️ **already deployed, untracked** | `https://investments-diary.vercel.app` returns 200 (`server: Vercel`, `<title>Investments diary</title>`), `/dashboard` → 302 `/auth/signin`. It is not known whether this came from a manual `vercel --prod` or from the git integration |
| 7. Deployment Protection on previews | ❓ unverified                      | panel-only setting                                                                                                                                                                                                                        |
| 8. Local dev unchanged               | ✅                                 | `npm run dev`                                                                                                                                                                                                                             |
| 9. Fix `tech-stack.md`               | ⚠️ partial                         | frontmatter says `vercel`, but the `## Why this stack` body still talks about Cloudflare Pages and the edge runtime                                                                                                                       |

So "first deploy" in practice means **bringing an existing production deployment under
control and making it safe**. It is not a from-scratch launch.

## 2. Gaps found in infrastructure.md (and fixes)

Ordered by severity. Items marked **[new]** are not in `infrastructure.md`.

1. **[new] Public sign-up in production, for a private financial diary (HIGH).**
   `/auth/signup` returns 200, and `supabase.auth.signUp()` in
   `src/pages/api/auth/signup.ts` has no gate. Anyone with the URL can create an account
   in your Supabase project. The PRD lists this as Open Question 3 (open registration vs
   a single provisioned account) and says to resolve it _before implementation_. It is
   still open while the app is live. → Phase B, step B3.
   Actions: decided 2026-11-02 (PRD FR-001 amended, OQ3 resolved): owner-created accounts only. Code side is change
   `close-public-signup` (`context/changes/close-public-signup/`): the sign-up page and API are removed
   (`/auth/signup` → 404) and the owner creates accounts with `npm run user:create`. The hosted Auth setting is
   still B3 (human).
2. **[fixed] Supabase Auth URL config for production (HIGH).** `supabase/config.toml` only
   has `site_url = "http://127.0.0.1:3000"`, and that file configures the **local** stack
   only. In the hosted project, the Site URL and Redirect URLs must include
   `https://investments-diary.vercel.app`. If they don't, confirmation and reset emails
   point at localhost. `infrastructure.md` skips this completely. → B2.
   Actions:this configuration is for local development
3. **[fixed] Conflict between "auto-deploy-on-merge" and "human approval".**
   `tech-stack.md` sets `ci_default_flow: auto-deploy-on-merge`. The _Approval_ section
   of `infrastructure.md` says "promotion to production must be approved by human".
   With the Vercel Git integration left on defaults, a push to `master` = a production
   deploy, with no gate. Fix: production builds with auto-promotion turned off (they land
   as _staged_), and a human promotes them. → C2, D3.
   Actions: Decided to allow auto deploy, infrastructure.md updated.
4. **[fixed] `npm run smoke` must NOT run against production.** The script creates a real
   account (`smoke-<ts>@example.com`) on every run and expects sign-in with no email
   confirmation. Against prod it would pollute `auth.users`, and it would stop working
   once sign-up is disabled (B3). Production gets a separate, **read-only** check. → E1.
   Actions: decided to have only one environment for now.
5. **[fixed 2026-09-24] Local dev and production share one Supabase project.** Local `.env` pointed at
   `*.supabase.co` (the hosted project), so any test in `npm run dev` wrote to the
   production database. → Open decisions, item 2.
   Note on item 4: "one environment" now means one _deployed_ environment (production).
   Local dev is isolated, so `npm run smoke` runs there safely.
6. **[fixed 2026-09-24] Unknown state of the GitHub secrets.** `gh secret list` returns nothing, yet
   the `ci` job (`npm run build` with `optional: false`) passed. Either the secrets live
   at the environment or org level, or the build doesn't validate `astro:env` the way we
   assume. Needs checking, because CI is supposed to catch a missing secret. → A3.
   Verified that secrets are in repository.
7. **[fixed 2026-09-24]**`@supabase/ssr` not pinned.** The risk register says "pin the exact version", but
   `package.json` still has `^0.12.7`. → B1.
   pinnded by : npm i -E @supabase/ssr@0.12.7
8. **[fixed 2026-09-24] Stale docs that will mislead an agent.** `.claude/skills/verify/SKILL.md`
   said "build for the Cloudflare adapter" and "`optional: true`, so a green build does not
   prove…". Both have been false since the migration. The same applied to the body of
   `tech-stack.md`. → B1.
   Actions:
   - `verify` skill: build comment names the Vercel adapter; the Supabase note now says a
     missing variable _fails_ the build; the smoke recipe uses the local stack and
     `npm run dev` (not the broken `npm run preview`), stops the Astro 7 dev daemon, and warns
     never to point `BASE_URL` at production.
   - `tech-stack.md` `## Why this stack`: Cloudflare Pages / edge-runtime sentences replaced
     with Vercel serverless on Node 24 and why (pre-1.0 Supabase auth off non-Node runtimes).
   - `CLAUDE.md`: dropped the "`tech-stack.md` still says `cloudflare-pages`" tripwire (no
     longer true) and linked this plan instead; the `npm run smoke` entry now requires the
     local stack and forbids production.
   - Left as is on purpose: the historical "migrated from Cloudflare" notes in `CLAUDE.md`
     (they explain _why_ rules exist) and the `# cloudflare` block in `.gitignore` (harmless).
9. **Minor:** `/sitemap-index.xml` → 404 (`@astrojs/sitemap` generates nothing when
   every route is SSR). For a private app, removing the integration and adding
   `noindex` is better than fixing the sitemap. → B1 (optional).

## 3. Access posture

- The Vercel CLI runs as `npx vercel@latest` (no global install). The agent uses an
  **OAuth login done by the human** (`npx vercel login` in your terminal), or a token
  scoped to the Hobby team in the `VERCEL_TOKEN` env var. Never in a repo file, never
  pasted into the conversation.
- The Vercel MCP server is **not added** at the MVP stage. CLI is enough (see
  `infrastructure.md` → Logs).
- **Human only:** changing or rotating env vars in Vercel, Supabase Auth settings,
  deleting users or a project, `vercel promote` / `vercel rollback` onto production,
  Deployment Protection settings.
- **The agent may do on its own:** `vercel ls`, `vercel inspect`, `vercel logs`,
  `vercel env ls` (names only), `vercel deploy` **without** `--prod` (preview), and
  read-only `curl` against production.

### Production service-role key

`npm run user:create` creates owner accounts (email and password, already confirmed). It targets the local Supabase
stack by default. `--production --url https://<ref>.supabase.co` targets the hosted project.

- The production service-role key is **owner-only**. The owner copies it from the Supabase dashboard at run time and
  types it into the script's hidden prompt, then types the project ref to confirm.
- It is never stored in any file (`.env`, `.env.local`, repo, notes), env var, shell history or Vercel, and never
  pasted into the conversation.
- **Agents never run `npm run user:create --production`**, and never ask for the key. Agents may run the local
  default.

## 4. Plan

### Phase A — Inventory (agent, read-only)

| #   | Owner | Action                                                                                                                  | Pass criterion                                                                                                                                     |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | human | `npx vercel@latest login` in your own terminal                                                                          | `npx vercel@latest whoami` returns your account                                                                                                    |
| A2  | agent | `npx vercel@latest ls investments-diary` and `npx vercel@latest inspect https://investments-diary.vercel.app`           | We know the ID of the current production deployment and its source (`cli` vs `git`). **Write that ID in the log below: it is the rollback target** |
| A3  | agent | `npx vercel@latest env ls` and `gh secret list --env production`, `gh api repos/noemiko/investments-diary/environments` | `SUPABASE_URL` and `SUPABASE_KEY` exist for **Production**. We know where CI gets its secrets from                                                 |
| A4  | human | Vercel → Project → Settings → Git: is the repo connected, and which branch is production                                | Answer written in the log                                                                                                                          |

### Phase B — Code and config fixes (agent → human via PR)

On branch `chore/deploy-hardening`, in one PR:

| #   | Owner     | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | agent     | (a) `npm i -E @supabase/ssr@0.12.7`. (b) ~~Fix `verify` skill~~ done 2026-09-24. (c) ~~Rewrite `tech-stack.md` body~~ done 2026-09-24. (d) Optional: remove `@astrojs/sitemap`, add `<meta name="robots" content="noindex">` in `Layout.astro`. Then run the `verify` skill (sync → lint → check → build)                                                                                                                                                                                 |
| B2  | **human** | Supabase Dashboard → Authentication → URL Configuration: **Site URL** = `https://investments-diary.vercel.app`, **Redirect URLs** += `https://investments-diary.vercel.app/**`. Without the `/**` entry Supabase rejects signup's `emailRedirectTo` (`/auth/callback`), falls back to Site URL, and the PKCE `?code=` is dropped on `/`. Add a pattern for previews only if they should use auth (see open decisions)                                                                     |
| B3  | **human** | PRD Open Question 3 is resolved (2026-11-02: owner-created accounts, change `close-public-signup`). Your production account already exists; further accounts are created with `npm run user:create --production` (see [production service-role key](#production-service-role-key)). (1) Authentication → Sign In / Providers → **disable "Allow new users to sign up"**, (2) delete any stray accounts in Users. The removed `/auth/signup` form is not the gate: the Supabase setting is |
| B4  | agent     | Open the PR. CI (`ci` + `smoke`) must be green. The `smoke` job uses **local** Supabase, so it doesn't depend on B3                                                                                                                                                                                                                                                                                                                                                                       |

### Phase C — Vercel project settings (human, panel)

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Settings → Deployment Protection → **Vercel Authentication: Standard Protection** (covers previews). Check that production stays public: the app's own login protects it                                                                                                                                                                                                                                             |
| C2  | Settings → Environments → Production → turn off **"Auto-assign Custom Production Domains"**. This makes every production build from `master` _staged_, so it doesn't take over traffic until someone runs `vercel promote`. This settles the conflict from gap 3 while keeping auto-build on merge                                                                                                                   |
| C3  | Settings → Environment Variables: confirm `SUPABASE_URL` / `SUPABASE_KEY` are **Production** (and **Preview**, if you choose so under open decision 1), and **not Development**. Otherwise `vercel env pull` writes production keys into `.env.local`, which overrides the local `.env` (gap 5). Do **not** run `vercel install supabase` / the Marketplace integration: it creates a second, empty Supabase project |
| C4  | Settings → General → Node.js Version = **24.x** (must match `engines` and `.nvmrc`)                                                                                                                                                                                                                                                                                                                                  |

### Phase D — Deploy (agent builds, human promotes)

| #   | Owner     | Command                                                                                  | Note                                                                                                         |
| --- | --------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1  | human     | Merge the PR from B4 into `master`                                                       | With the git integration and C2 on, Vercel builds a **staged** production deployment                         |
| D1′ | agent     | _(only if A4 showed no git integration)_ `npx vercel@latest deploy --prod --skip-domain` | CLI equivalent of a staged deploy. Do **not** use plain `vercel --prod`, because that promotes straight away |
| D2  | agent     | `npx vercel@latest inspect <staged-url> --logs`. Wait for `READY`                        | Build logs with no errors. `@astrojs/vercel` reports Node 24 runtime                                         |
| D3  | **human** | `npx vercel@latest promote <staged-url>`                                                 | The only production gate. The agent never runs this command itself                                           |

### Phase E — Verification (agent, read-only against prod)

| #   | Owner     | Check                                                                                                                                          | Expected                                                                    |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| E1  | agent     | `for p in / /auth/signin; do curl -s -o /dev/null -w '%{http_code}\n' https://investments-diary.vercel.app$p; done`                            | `200`, `200`                                                                |
| E2  | agent     | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://investments-diary.vercel.app/dashboard`                                      | `302 …/auth/signin` (gating works = Supabase client configured)             |
| E3  | agent     | `npx vercel@latest inspect https://investments-diary.vercel.app`                                                                               | Deployment ID = the one promoted in D3                                      |
| E4  | **human** | Sign in with your own account in the browser, open `/dashboard`, sign out                                                                      | Works. Session survives a refresh                                           |
| E5  | **human** | Call the hosted Auth API sign-up endpoint (`POST https://<ref>.supabase.co/auth/v1/signup` with the public key and a throwaway email/password) | `422 signup_disabled` if B3 is done. `/auth/signup` in the app returns 404  |
| E6  | agent     | `npx vercel@latest logs https://investments-diary.vercel.app` for ~2 min during E4                                                             | No 5xx. Logs are kept only **1h** on Hobby, so check them now, not tomorrow |
| E7  | human     | Open any preview URL in a private window                                                                                                       | Vercel login screen (C1)                                                    |

**Do not run** `npm run smoke` against production (gap 4).

## 5. Rollback

- **Trigger:** E1–E4 fail, or a 5xx shows up in logs after promotion.
- **Action (human):** `npx vercel@latest rollback <deployment-id-from-A2>`. It's a pointer
  flip and takes seconds. No rebuild.
- **Data:** the original starter deploy had no migrations; that assumption is historical.
  The current stock-price release removes obsolete metadata/API contracts, so arbitrary
  old deployments are not safe rollback targets. Follow the feature's [compatible recovery](#compatible-recovery-and-rollback): retain schema/data and observations, use reviewed additive selection recovery and compatible application builds. Do not apply a destructive down migration.
- **Supabase setting changes (B2, B3)** are independent of code rollback. Undo them by
  hand in the panel if needed.

## 6. Open decisions (owner: human)

1. **Preview → which database?** Options: (a) previews get no Supabase env vars, so the
   build fails with `optional: false` and there are effectively no previews; (b) previews
   use the production Supabase behind Deployment Protection; (c) a separate free
   Supabase project for preview/dev. Recommendation: **(b)** for the MVP, because it's one
   user, and the deadline 2026-11-04 doesn't justify a second project. Revisit before the
   first migration.
2. ~~**Local dev on the production database.**~~ **Resolved 2026-09-24:** dev switched to the
   local stack with a guard in code (see gap 5). Migrations: `npx supabase migration new`,
   then `npx supabase db reset` locally, and `npx supabase db push` to production (human only).
3. ~~**Sign-up (PRD OQ3)**~~ **Resolved 2026-11-02:** owner-created accounts (change `close-public-signup`). The
   hosted setting is still B3.

## 7. Execution log

Fill in during execution.

| Step                                            | Date       | Result / ID                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gap 5: local dev isolated from production       | 2026-09-24 | done. Local Supabase stack, guard in `src/lib/supabase.ts`, smoke 8/8 locally. Uncommitted, goes into the B4 PR                                                                                                                                                                                                                                  |
| B2 hosted Auth URL config                       | 2026-10-14 | **not done**: signup emails still linked to `http://localhost:3000` (hosted default Site URL). Code side fixed in `context/changes/auth-email-callback/` (`emailRedirectTo` → `/auth/callback`). Still to do in the dashboard: Site URL + Redirect URLs `https://investments-diary.vercel.app/**` (and the preview pattern if previews use auth) |
| A2 current prod deployment ID (rollback target) |            |                                                                                                                                                                                                                                                                                                                                                  |
| A4 git integration / production branch          |            |                                                                                                                                                                                                                                                                                                                                                  |
| D3 promoted deployment                          |            |                                                                                                                                                                                                                                                                                                                                                  |
| E1–E7                                           |            |                                                                                                                                                                                                                                                                                                                                                  |

## Stock-price release and recovery

This section covers FR-003, FR-006 and FR-013–FR-016 at the schema-compatible application baseline `0a954cb`. It consolidates the stock-price runbook and wallet operations by owner request. It is preparation, not evidence of a hosted migration, deployment or new live-provider check. Record actual release IDs and results in the change's [verification record](../changes/automatic-stock-prices/verification.md).

### Release boundaries

- Node is 24.x; the pinned provider is `yahoo-finance2@4.0.5`. The access posture above keeps hosted schema changes, environment/protection settings, production promotion and rollback under human control. Agents may prepare and review artifacts and record owner-supplied results; they do not run or request any Vercel cloud command, including read-only inventory, deployments or removals (see `context/foundation/lessons.md`). For this release, the human runs every Vercel and hosted-Supabase command.
- The recorded environment inventory on 2026-11-02 found `SUPABASE_URL`/`SUPABASE_KEY` in Production only. A full-app Preview needs an explicitly chosen database and Preview configuration from the human; do not assume either exists or silently provision a new project. Never pull hosted values into local `.env`/`.env.local`.
- Pre-migration production reference: `dpl_FVc6GVQQMXRWeV69KuVAcfajfwaD`, unique URL `investments-diary-oi2k5w6fn-wakarimasen8-8554.vercel.app`. This is an inventory reference, **not an approved post-migration rollback target**. Its source SHA was not established by the inventory.
- Feature pushes alone do not run CI. A PR against `master` runs deterministic CI checks; the HTTP smoke job runs after a master push. Confirm actual deployment/auto-promotion settings before merging. An automatic application release must not race ahead of the hosted schema.

### Schema-first rollout

Have a recoverable backup, a reviewed release build and a schema-compatible recovery plan before the maintenance window. List the hosted migration ledger and inspect the dry run in the human's authenticated terminal (`npx supabase migration list --linked`, `npx supabase db push --dry-run`). Confirm the intended project privately. A human applies the reviewed hosted migration chain; never use `db reset` or repair the ledger merely to bypass an error.

Do not assume the seven predecessors are already hosted: diary core, manual price, wallets, wallet deletion protection, closing, snapshot storage/function and cron registration must precede these eleven feature migrations, in filename order:

| Migration                                                        | Required result                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `20261030110418_market_price_persistence.sql`                    | Cache, owner RPCs, manual-save timestamps and shared selection view                                                                     |
| `20261030114323_listing_lookup_receipts.sql`                     | Existing-position lookup receipts and explicit confirmation (RPCs retired by the last migration below)                                  |
| `20261030122155_effective_snapshots_and_wallet_moves.sql`        | Effective-price capture, source coverage and restricted wallet moves                                                                    |
| `20261030123038_order_wallet_move_locks.sql`                     | Deterministic wallet lock ordering                                                                                                      |
| `20261030140619_set_wallet_denominations.sql`                    | Unset wallets become USD; snapshot labels inherit wallet currency; obsolete attestation columns/three-argument move API removed         |
| `20261030162000_pending_stock_selections.sql`                    | Durable search targets and expiring owner/wallet-bound creation choices                                                                 |
| `20261030162500_pending_listing_currency_context.sql`            | Persisted mismatch context from a verified cache identity                                                                               |
| `20261102080240_validate_selection_without_update_privilege.sql` | Creation validation without granting UPDATE access to receipts                                                                          |
| `20261102120000_require_position_stock_selection.sql`            | Every position gets a stock selection (Apple for drafts by owner decision, matching target for confirmed listings); NOT NULL            |
| `20261102130000_retire_listing_lookup_rpcs.sql`                  | `claim_/finish_/confirm_listing_lookup` no longer executable by `public`/`anon`/`authenticated`; functions and receipts kept            |
| `20261102140000_revoke_listing_column_updates.sql`               | Signed-in users can no longer UPDATE `positions.market_listing_id`/`listing_confirmed_at`; listings attach only through Download prices |

The denomination migration breaks applications that still select removed wallet fields or call the old move API. A schema-first release therefore needs a maintenance transition, not ordinary traffic on the previous application between migration files.

1. Record the served deployment, source revision when available, hosted ledger, cron state and private backups. For existing tables record row counts and digests of recorded position/snapshot amounts and dates. Currency labels are the authorised metadata exception; money, dates and historical source coverage must not be recalculated.
2. A human places the diary behind a reviewed static maintenance deployment that does not access Supabase, or an equivalent controlled maintenance boundary that stops old application traffic/writes. Do not change Deployment Protection or production aliases automatically. Keep this artifact available through the schema transition.
3. Use a window away from **00:00 UTC**. Record and pause the existing named snapshot job if present. If cron registration is still pending, that migration activates the job: check/pause it after migration rather than assuming its previous state survived registration. Missed days remain gaps.
4. The human applies the **entire pending hosted chain**, including the receipt-guard fix, the required-selection migration and the lookup-RPC retirement, and stops on any error. Do not run a mixed intermediate schema/application combination or edit an already-applied migration. Inspect the ledger and final schema before allowing app traffic.
5. Verify unset wallet currencies are gone, snapshot currency labels are present, every position has `market_target_id` (`select count(*) from public.positions where market_target_id is null` returns 0) and the `positions_guard_selection` trigger is enabled, `has_function_privilege('authenticated','public.confirm_listing_lookup(uuid,uuid)','execute')` (and the same for `claim_listing_lookup(uuid)` and `finish_listing_lookup(uuid,uuid,uuid,timestamptz,boolean)`) returns false, recorded facts/digests match, RLS/grants remain restricted and the current capture signature still exists. The approved conversion is labels only: unset wallets become USD and previously unlabelled observations inherit their owning wallet denomination. Existing non-null wallet currencies remain frozen; missing historical manual-save times/source coverage stay unknown.
6. Stage/inspect the compatible application with the selected database/environment. Only after the schema checkpoint may that application consume it. A human promotes it, or performs the explicitly agreed production switch. Test sign-in/read paths before the [US/GPW walkthrough](../changes/automatic-stock-prices/ui-verification.md); record deployed URL/source revision and actual results.
7. Restore the recorded intended cron state after compatibility checks. Verify its command is `select public.capture_wallet_snapshots();` and schedule `0 0 * * *` in UTC/GMT. Do not run an immediate production capture to fill a missed day. Keep maintenance/recovery artifacts until the rollout has been accepted.

Use [wallet observations and cron](#wallet-observations-and-cron) for exact job queries and the named-job pause operation. Ordinary authenticated/anonymous roles must not execute capture or write snapshots. `public.capture_wallet_snapshots()` returns `bigint`, is restricted to `service_role`, and performs no provider request.

### Application acceptance

New investment: choose the intended USD/PLN/EUR wallet, explicitly search Yahoo metadata, select the company/exchange, enter buy facts/reason and Save. A typed name alone is insufficient. Search, Select and Save preserve other draft input and do not download a quote. Form choices expire after 30 minutes; saved targets do not expire with their form receipts.

The later dashboard **Download prices** validates actual currency/timezone before applying a quote. Search cannot establish those fields. Matching wallets can be priced while another holding of the same selected stock remains incompatible; no conversion occurs. Existing diary labels/manual holdings remain usable. Investments saved before selections existed carry Apple (`AAPL`/`NMS`) by owner decision on 2026-11-02, so their first **Download prices** prices USD-wallet holdings with Apple and reports `incompatible_currency` for PLN/EUR ones; their manual values stay until a later quote wins. Existing-position listing search/download/confirmation is retired (HTTP 409 `selection_already_set`, and its database RPCs are not executable by signed-in users); a holding with the wrong stock is deleted and recreated.

For the deployed walkthrough, use `AAPL` in USD and `PKO.WA` in PLN with the human's authorised test holdings. Inspect source, actual market timestamp, exchange, currency, market state and delay separately from fetch time. Reload/focus/wait must not cause a quote request. A closed market may return the same prior-session quote; fetching it again does not make its market timestamp newer. Use the [API walkthrough](../changes/automatic-stock-prices/download-api.md) only in that owner's same-origin session.

The explicit public-symbol probe is `npm run probe:market-data -- --live` on Node 24. It reads no diary data or `.env` and tests fixed public symbols plus controlled SDK cancellation. It is separate from app triggers and deterministic CI. Local success is not deployed proof; follow the isolated protected [Vercel probe recipe](../changes/automatic-stock-prices/provider-validation.md) when a fresh runtime/provider check is needed. Never install an unprotected diagnostic route in the diary.

### Provider failures and manual fallback

| State                                       | Response                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `refreshing`                                | Another request holds a 30-second lease. Wait for completion/expiry, then explicitly click again. Do not clear lease tokens manually.                                                                                                                  |
| `cooldown`, timeout or provider unavailable | Retain the last valid cache; otherwise use a manual price or show missing coverage. Wait at least 15 minutes, or the longer reported retry instant, before clicking again. Waiting does not retry.                                                     |
| `due`                                       | Work was not sent within the shared five-second provider budget. A later click attempts it; no background job is scheduled.                                                                                                                            |
| `older_quote`                               | Older market data was ignored; the last valid quote remains. Respect the shown retry instant. A new fetch time does not justify replacing a newer market time.                                                                                         |
| `invalid_quote`                             | Keep stored values. Inspect symbol/exchange/type, currency/timezone and timestamps; do not relax validation or edit immutable cache identity fields.                                                                                                   |
| `incompatible_currency`                     | Leave the incompatible holding's selection/manual values intact. Selections cannot be edited: delete and recreate the holding with the right stock, or keep it on manual prices; never reinterpret amounts or move across denominations automatically. |
| Expired creation choice                     | An unsaved creation choice needs a new explicit Search/Select. Expiry performs no provider work.                                                                                                                                                       |

An explicit manual-price save on an open holding stamps its database save time, even if the same number/date is resubmitted. That correction wins until a market timestamp is **strictly later** than its save time. Equal/older timestamps do not replace it. Without a usable automatic quote, the saved manual pair remains the fallback. Closed positions use their sale price/date, including a valid zero sale. Missing quantity or open price is excluded and reported; it is not a zero gain.

Do not empty the cache, reset cooldowns, edit save times or remove receipt references to troubleshoot an outage. Sanitized application errors provide bounded reasons/status/retry information; raw provider bodies, URLs, cookies, crumbs and credentials do not belong in logs or support messages. Search availability is still required to select a new stock; an outage is not permission to silently restore free-text creation.

### Owner-scoped inspection

Prefer the author's authenticated, RLS-scoped application reads. For privileged operator inspection, bind **one verified owner UUID** in each query, use only needed fields and keep output private. The following SQL is read-only; replace `OWNER_UUID` in the operator's trusted database session. Do not log keys, lease tokens or raw provider payloads.

```sql
select id,symbol,exchange,currency,timezone,price is not null as has_quote,
  market_at,fetched_at,refresh_outcome,cooldown_until,lease_until
from public.market_quote_cache where user_id='OWNER_UUID'::uuid order by symbol,id;

select id,symbol,exchange,cache_id,refresh_outcome,cooldown_until,lease_until
from public.market_listing_targets where user_id='OWNER_UUID'::uuid order by symbol,id;

select id,wallet_id,selected_source,selected_at,manual_price_saved_at,
  quote_market_at,quote_currency,wallet_currency,pending_symbol,pending_currency
from public.position_effective_prices
where user_id='OWNER_UUID'::uuid and deleted_at is null order by id;

select wallet_id,observation_day,currency,realised_count,open_count,not_counted,
  automatic_count,manual_count,oldest_market_at
from public.wallet_snapshots where user_id='OWNER_UUID'::uuid
order by observation_day desc,wallet_id limit 50;
```

Unknown historical source counts stay null. Saved positions can still reference expired creation receipts; do not blindly purge them. Page reads, snapshot inspection and cache-age expiry must not call Yahoo. Successful quotes have no age-based refresh restriction, but the next request still needs the button and must respect leases/failure cooldowns.

### Compatible recovery and rollback

Provider unavailability alone normally needs no rollback: retained quotes and manual corrections are the intended degradation path. For a pricing-selection defect, keep the compatible application/schema and recover selection through a new reviewed additive migration. Do **not** promote an arbitrary pre-feature deployment, drop tables/columns, clear caches/targets/receipts, restore removed attestation fields or delete/recalculate observations. The old pre-Phase4 creation and wallet contracts are incompatible with the final schema.

The reviewable [manual-selection operator template](automatic-stock-prices-manual-selection.sql) is **outside** `supabase/migrations`; it is not executed by normal rollout. It replaces only the four selected-value outputs of the current view with raw manual/sale values. It preserves every view column/type/order, security-invoker mode, grants and view identity. The unchanged capture function consumes that same view, so application reads and future observations switch together. Quote-cache data and already captured observations remain untouched. Automatic-only holdings temporarily become missing coverage until a manual price is saved.

Human recovery sequence:

1. Record the incident, current schema/deployment and intended cron state. Pause the named job during the controlled transition if needed. Keep the compatible `0a954cb`-line app; mandatory Yahoo selection at creation remains in force.
2. Scaffold a **new** timestamped migration and copy the reviewed template into it. Rehearse the migration chain on local fixtures, including `npm run test:recovery-db` and the exact decimal/snapshot checks below. Never modify or reapply an old migration.
3. Save the reviewed normal `pg_get_viewdef('public.position_effective_prices'::regclass,true)` definition privately before recovery, together with its column/type/order, grants and security-invoker settings. This is the restoration source, not a data backup or deployment secret.
4. The human applies the approved recovery migration to the intended hosted project. Verify manual/sale/missing selection and unchanged cache/target/receipt/position/old-snapshot facts before restoring traffic/cron. A manual correction is entered through the existing UI, not by spoofing its timestamp.
5. If an application defect also requires a code change, promote only a tested schema-compatible build. This section does not provide a nonexistent feature-flag command, and rolling back selection does not disable explicit downloads or bypass required metadata selection.

The required-selection migration has an additive rollback too: if ever needed, a new reviewed migration runs `alter table public.positions alter column market_target_id drop not null`. Selections stay as data; do not clear them.

Re-enable automatic selection through another reviewed additive migration restoring the recorded **normal** view definition, all current columns/order/types and `security_invoker=true`; use `CREATE OR REPLACE` so grants and dependencies survive. Rehearse normal → manual → normal parity first. Inspect which saved quotes would now win under the strict manual-save rule. The same capture function then resumes normal shared selection; observations captured during manual recovery stay as recorded and are never rewritten.

If a future defect requires replacing the capture body itself, preserve its no-argument `bigint` signature, definer/search-path settings, restricted grants, midnight job and idempotent insert. Prepare a new additive migration from the **current** definition, retaining required currency and source-coverage fields. A manual body must count raw manual/sale contributions, use zero automatic coverage/null oldest automatic time and match the shared manual view. Do not copy the obsolete pre-currency function body or install a down migration. This alternative is preparation guidance; the supplied tested recovery uses the unchanged capture body.

### Wallet observations and cron

Snapshots record diary values using the shared selection of saved manual prices and explicitly downloaded quotes, not market closes or cash balances. Capture runs at midnight UTC (01:00/02:00 Warsaw) and never downloads prices. Missed days stay gaps. Existing wallets wait for the first capture; no backfill occurs. Changes later in a day affect the next capture; old amounts/dates remain unchanged.

The stock-price migration assigns USD to previously unspecified wallets and gives unlabelled observations their wallet denomination by owner decision; it does not convert amounts or invent missing historical source coverage. New captures retain selected manual/automatic coverage and quote-time context. Compatible recovery above preserves the capture function's signature, privileges and job while keeping application/capture parity.

Scheduling is infrastructure as code. The normal Supabase chain includes:

- `20261028160000_wallet_snapshots.sql`: snapshot storage and the restricted capture function.
- `20261028170000_register_daily_wallet_snapshot_job.sql`: installs/enables `pg_cron`, validates UTC/GMT and registers the daily job. **Applying it activates the schedule**, including production through the authorised process.

For local development, apply pending migrations with `npx supabase migration up --local`. No Vercel cron, HTTP endpoint or additional secret is required. Named registration updates an existing manually configured job instead of adding a duplicate. Cron infrastructure runs in its configured database (`postgres` on Supabase); registration fails clearly if its timezone is not UTC/GMT.

`npm run configure:wallet-cron` is a local repair helper using the same migration SQL. `npm run test:wallet-cron` checks the actual migration twice inside a rolled-back local transaction. Disposable domain databases exclude cron infrastructure because pg_cron cannot install in a second database; the separate cron test verifies its configured database. Authenticated and anonymous roles cannot execute capture or write snapshots. Local verification does not establish production activation or automated alerting.

Inspect configuration, last run and missing observations in the trusted operator session:

```sql
select jobid, jobname, schedule, command, active
from cron.job where jobname='wallet-daily-observations';

select d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='wallet-daily-observations'
order by d.start_time desc limit 10;

select w.id, max(s.observation_day) as last_day
from public.wallets w left join public.wallet_snapshots s on s.wallet_id=w.id
where w.user_id='OWNER_UUID'::uuid and w.deleted_at is null group by w.id
having max(s.observation_day) is null
  or max(s.observation_day)<(now() at time zone 'UTC')::date;
```

The UI reports actual last capture time and missing observation today when appropriate. A missing day must not be recreated from today's values. Inspect job history and fix forward on failure. To pause, the human disables only the named job; never uninstall pg_cron and affect other jobs:

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname='wallet-daily-observations';
```

Restore `active := true` only when the recorded intended state was active and compatibility checks pass. Preserve all existing snapshot rows on recovery.

#### Local wallet demo

Export `DEMO_USER_PASSWORD` (at least 12 characters), then run `npm run seed:demo` locally. Sign in with `wallet-demo@example.test` and that password. Passwords/keys are never printed. Existing accounts must carry this seed's app-metadata marker; unmarked collisions are refused. Reruns preserve the existing password and manual edits.

The five `Demo · …` wallets are Rising, Falling, Mixed, Flat and Empty; 100 synthetic investments occupy the first four and synthetic history spans roughly a year with gaps. The first seed anchors dates, so reruns repair missing fixtures without fabricating new days. The open AAPL fixture is already linked using metadata only; its first real price still requires Download prices, unless a real quote already exists in the canonical owner cache.

`npm run seed:demo -- --reset` restores recognised fixtures only and refuses unrelated position/lookup references to their wallets, categories or fixture cache. Never use `supabase db reset` for demo setup. `npm run test:demo-db` creates and cleans a marked disposable account. All demo/test work is local.

### Deterministic release checks

Run the repository static sequence in order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`, then `npm test`. Use Node 24 and local Supabase only for all fixture/account-creating commands.

| Risk                                                                                  | Existing regression boundary                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider normalization, missing/partial results, cancellation, safe failures          | `src/lib/market-data/yahoo.test.ts`, `endpoint.test.ts`, `trigger-boundaries.test.ts`                                                                                                                          |
| Batches, cache identity, leases/cooldowns, manual boundaries                          | `src/lib/services/market-prices.test.ts`; `tests/database/market-prices.test.ts` (`npm run test:decimal-db`)                                                                                                   |
| Exact transport, ownership, receipt lifetime, mixed currency, reassignment, zero sale | `npm run test:decimal-db` (`tests/database/`)                                                                                                                                                                  |
| Snapshot values, idempotency, immutable observations                                  | `tests/database/effective-valuations.test.ts`, `wallet-snapshots.test.ts` (`npm run test:decimal-db`); concurrent capture idempotency has no database test (accepted 2026-11-02)                               |
| Manual recovery and re-enable                                                         | `npm run test:recovery-db` (`test-market-price-recovery.mjs`): unchanged stored facts/view contract, owner isolation and exact manual/sale app/capture parity                                                  |
| Required stock selection                                                              | Creation receipts and selections: `tests/database/market-selections.test.ts` (`npm run test:decimal-db`). The NOT NULL/guard rules and the one-time Apple backfill have no database test (accepted 2026-11-02) |
| Actual midnight registration and capture privilege                                    | `npm run test:wallet-cron` (rolled-back local metadata transaction)                                                                                                                                            |
| Native/hydrated creation, retained inputs, explicit controls, moves/history           | `tests/e2e/investment-persists.spec.ts`, `market-price-controls.spec.ts`, `wallet-dashboard.spec.ts`                                                                                                           |
| Auth/financial integrity and demo repair/reset                                        | Local `npm run smoke`, `npm run test:demo-db`; `npm run test:contract-db` (every policy granted, no anon access, every table reachable only by its owner)                                                      |

The recovery runner creates/drops its own local database and skips cron installation there; it checks capture definition/permissions unchanged, while `test:wallet-cron` verifies real scheduling separately. CI includes the recovery check and the contract test in the local decimal-transport job. Operator SQL counts as code for CI/build filtering; Markdown-only changes remain skipped. Browser/search fixtures do not establish live provider availability. No automated test/demo/smoke command belongs against production.
