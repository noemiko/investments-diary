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

## 1. State at planning time (checked 2026-09-24)

Most of the Getting Started section in `infrastructure.md` is already done. Plan against
the real state, not the checklist:

| infrastructure.md step | State | Evidence |
|---|---|---|
| 1. git + GitHub remote | ✅ done | `origin` = `github.com/noemiko/investments-diary`, 3 commits, clean tree |
| 2. Remove Cloudflare adapter | ✅ done | no `@astrojs/cloudflare` or `wrangler` in `package.json`, no `wrangler.jsonc` |
| 3. Vercel adapter | ✅ done | `@astrojs/vercel` ^11.0.11, `import vercel from "@astrojs/vercel"` (no `/serverless`) |
| 4. `optional: false` in env schema | ✅ done | `astro.config.mjs`: both fields are `optional: false` |
| 5. Link + secrets | ⚠️ partial | `.vercel/project.json` is linked (`prj_HMLj…`). Whether the env vars are scoped to Production, Preview or both is **unverified** |
| 6. Deploy | ⚠️ **already deployed, untracked** | `https://investments-diary.vercel.app` returns 200 (`server: Vercel`, `<title>Investments diary</title>`), `/dashboard` → 302 `/auth/signin`. It is not known whether this came from a manual `vercel --prod` or from the git integration |
| 7. Deployment Protection on previews | ❓ unverified | panel-only setting |
| 8. Local dev unchanged | ✅ | `npm run dev` |
| 9. Fix `tech-stack.md` | ⚠️ partial | frontmatter says `vercel`, but the `## Why this stack` body still talks about Cloudflare Pages and the edge runtime |

So "first deploy" in practice means **bringing an existing production deployment under
control and making it safe**. It is not a from-scratch launch.

## 2. Gaps found in infrastructure.md (and fixes)

Ordered by severity. Items marked **[new]** are not in `infrastructure.md`.

1. **[new] Public sign-up in production, for a private financial diary (HIGH).**
   `/auth/signup` returns 200, and `supabase.auth.signUp()` in
   `src/pages/api/auth/signup.ts` has no gate. Anyone with the URL can create an account
   in your Supabase project. The PRD lists this as Open Question 3 (open registration vs
   a single provisioned account) and says to resolve it *before implementation*. It is
   still open while the app is live. → Phase B, step B3.
2. **[fixed] Supabase Auth URL config for production (HIGH).** `supabase/config.toml` only
   has `site_url = "http://127.0.0.1:3000"`, and that file configures the **local** stack
   only. In the hosted project, the Site URL and Redirect URLs must include
   `https://investments-diary.vercel.app`. If they don't, confirmation and reset emails
   point at localhost. `infrastructure.md` skips this completely. → B2.
   Actions:this configuration is for local development
3. **[fixed] Conflict between "auto-deploy-on-merge" and "human approval".**
   `tech-stack.md` sets `ci_default_flow: auto-deploy-on-merge`. The *Approval* section
   of `infrastructure.md` says "promotion to production must be approved by human".
   With the Vercel Git integration left on defaults, a push to `master` = a production
   deploy, with no gate. Fix: production builds with auto-promotion turned off (they land
   as *staged*), and a human promotes them. → C2, D3. 
   Actions: Decided to allow auto deploy, infrastructure.md updated.
4. **[fixed] `npm run smoke` must NOT run against production.** The script creates a real
   account (`smoke-<ts>@example.com`) on every run and expects sign-in with no email
   confirmation. Against prod it would pollute `auth.users`, and it would stop working
   once sign-up is disabled (B3). Production gets a separate, **read-only** check. → E1.
   Actions: decided to have only one environment for now.
5. **[fixed 2026-09-24] Local dev and production share one Supabase project.** Local `.env` pointed at
   `*.supabase.co` (the hosted project), so any test in `npm run dev` wrote to the
   production database. → Open decisions, item 2.
   Note on item 4: "one environment" now means one *deployed* environment (production).
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
     missing variable *fails* the build; the smoke recipe uses the local stack and
     `npm run dev` (not the broken `npm run preview`), stops the Astro 7 dev daemon, and warns
     never to point `BASE_URL` at production.
   - `tech-stack.md` `## Why this stack`: Cloudflare Pages / edge-runtime sentences replaced
     with Vercel serverless on Node 24 and why (pre-1.0 Supabase auth off non-Node runtimes).
   - `CLAUDE.md`: dropped the "`tech-stack.md` still says `cloudflare-pages`" tripwire (no
     longer true) and linked this plan instead; the `npm run smoke` entry now requires the
     local stack and forbids production.
   - Left as is on purpose: the historical "migrated from Cloudflare" notes in `CLAUDE.md`
     (they explain *why* rules exist) and the `# cloudflare` block in `.gitignore` (harmless).
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

## 4. Plan

### Phase A — Inventory (agent, read-only)

| # | Owner | Action | Pass criterion |
|---|---|---|---|
| A1 | human | `npx vercel@latest login` in your own terminal | `npx vercel@latest whoami` returns your account |
| A2 | agent | `npx vercel@latest ls investments-diary` and `npx vercel@latest inspect https://investments-diary.vercel.app` | We know the ID of the current production deployment and its source (`cli` vs `git`). **Write that ID in the log below: it is the rollback target** |
| A3 | agent | `npx vercel@latest env ls` and `gh secret list --env production`, `gh api repos/noemiko/investments-diary/environments` | `SUPABASE_URL` and `SUPABASE_KEY` exist for **Production**. We know where CI gets its secrets from |
| A4 | human | Vercel → Project → Settings → Git: is the repo connected, and which branch is production | Answer written in the log |

### Phase B — Code and config fixes (agent → human via PR)

On branch `chore/deploy-hardening`, in one PR:

| # | Owner | Action |
|---|---|---|
| B1 | agent | (a) `npm i -E @supabase/ssr@0.12.7`. (b) ~~Fix `verify` skill~~ done 2026-09-24. (c) ~~Rewrite `tech-stack.md` body~~ done 2026-09-24. (d) Optional: remove `@astrojs/sitemap`, add `<meta name="robots" content="noindex">` in `Layout.astro`. Then run the `verify` skill (sync → lint → check → build) |
| B2 | **human** | Supabase Dashboard → Authentication → URL Configuration: **Site URL** = `https://investments-diary.vercel.app`, **Redirect URLs** += `https://investments-diary.vercel.app/**`. Add a pattern for previews only if they should use auth (see open decisions) |
| B3 | **human** | Resolve PRD Open Question 3. Recommended for single-tenant: (1) create your account through `/auth/signup` or in the Supabase panel, (2) Authentication → Sign In / Providers → **disable "Allow new users to sign up"**, (3) delete any stray accounts in Users. Record the decision in `prd.md` → Open Questions. Hiding the `/auth/signup` form in code is optional: the Supabase setting is the real gate |
| B4 | agent | Open the PR. CI (`ci` + `smoke`) must be green. The `smoke` job uses **local** Supabase, so it doesn't depend on B3 |

### Phase C — Vercel project settings (human, panel)

| # | Action |
|---|---|
| C1 | Settings → Deployment Protection → **Vercel Authentication: Standard Protection** (covers previews). Check that production stays public: the app's own login protects it |
| C2 | Settings → Environments → Production → turn off **"Auto-assign Custom Production Domains"**. This makes every production build from `master` *staged*, so it doesn't take over traffic until someone runs `vercel promote`. This settles the conflict from gap 3 while keeping auto-build on merge |
| C3 | Settings → Environment Variables: confirm `SUPABASE_URL` / `SUPABASE_KEY` are **Production** (and **Preview**, if you choose so under open decision 1), and **not Development**. Otherwise `vercel env pull` writes production keys into `.env.local`, which overrides the local `.env` (gap 5). Do **not** run `vercel install supabase` / the Marketplace integration: it creates a second, empty Supabase project |
| C4 | Settings → General → Node.js Version = **24.x** (must match `engines` and `.nvmrc`) |

### Phase D — Deploy (agent builds, human promotes)

| # | Owner | Command | Note |
|---|---|---|---|
| D1 | human | Merge the PR from B4 into `master` | With the git integration and C2 on, Vercel builds a **staged** production deployment |
| D1′ | agent | *(only if A4 showed no git integration)* `npx vercel@latest deploy --prod --skip-domain` | CLI equivalent of a staged deploy. Do **not** use plain `vercel --prod`, because that promotes straight away |
| D2 | agent | `npx vercel@latest inspect <staged-url> --logs`. Wait for `READY` | Build logs with no errors. `@astrojs/vercel` reports Node 24 runtime |
| D3 | **human** | `npx vercel@latest promote <staged-url>` | The only production gate. The agent never runs this command itself |

### Phase E — Verification (agent, read-only against prod)

| # | Owner | Check | Expected |
|---|---|---|---|
| E1 | agent | `for p in / /auth/signin; do curl -s -o /dev/null -w '%{http_code}\n' https://investments-diary.vercel.app$p; done` | `200`, `200` |
| E2 | agent | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://investments-diary.vercel.app/dashboard` | `302 …/auth/signin` (gating works = Supabase client configured) |
| E3 | agent | `npx vercel@latest inspect https://investments-diary.vercel.app` | Deployment ID = the one promoted in D3 |
| E4 | **human** | Sign in with your own account in the browser, open `/dashboard`, sign out | Works. Session survives a refresh |
| E5 | **human** | Private window → `/auth/signup` → try to create an account | Supabase rejects it ("Signups not allowed") if B3 is done |
| E6 | agent | `npx vercel@latest logs https://investments-diary.vercel.app` for ~2 min during E4 | No 5xx. Logs are kept only **1h** on Hobby, so check them now, not tomorrow |
| E7 | human | Open any preview URL in a private window | Vercel login screen (C1) |

**Do not run** `npm run smoke` against production (gap 4).

## 5. Rollback

- **Trigger:** E1–E4 fail, or a 5xx shows up in logs after promotion.
- **Action (human):** `npx vercel@latest rollback <deployment-id-from-A2>`. It's a pointer
  flip and takes seconds. No rebuild.
- **Data:** this deploy has **no** migrations (the `supabase/migrations/` directory
  doesn't exist), so a code rollback is complete. From the first migration onward, follow
  the rule in `infrastructure.md`: down-migration first, and never a migration together
  with a feature in the same deploy.
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
3. **Sign-up (PRD OQ3)**: see B3.

## 7. Execution log

Fill in during execution.

| Step | Date | Result / ID |
|---|---|---|
| Gap 5: local dev isolated from production | 2026-09-24 | done. Local Supabase stack, guard in `src/lib/supabase.ts`, smoke 8/8 locally. Uncommitted, goes into the B4 PR |
| A2 current prod deployment ID (rollback target) | | |
| A4 git integration / production branch | | |
| D3 promoted deployment | | |
| E1–E7 | | |
