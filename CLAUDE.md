# CLAUDE.md

Do not name a specific agent below this line. `AGENTS.md` is a symlink to this file, so Codex and
Copilot read the same bytes.

## What this repo is

**Investments Diary** — a private, single-user investment journal that records the *reason*
behind each buy/sell and confronts the author with comparable past positions at decision time.
Product context: @context/foundation/prd.md (requirements), @context/foundation/tech-stack.md
(why this stack). Every domain behaviour must trace to an `FR-NNN` in the PRD. If a change needs
behaviour the PRD leaves undecided (its `## Open Questions`), stop and ask instead of picking one.

The code is the `10x-astro-starter` scaffold, renamed and migrated from Cloudflare to Vercel.

## Tripwires (read before editing)

- **Every new Supabase table needs RLS enabled**, with granular per-operation, per-role policies.
  The diary is single-user but the data is private by design, and a missing policy fails silently —
  nothing errors, the rows are just readable. This fires on the first domain migration.
- **Supabase env vars are required, not optional.** `SUPABASE_URL`/`SUPABASE_KEY` are
  `optional: false` in `astro.config.mjs` `env.schema`, and `createClient()` in @src/lib/supabase.ts
  throws on an empty value. Do not reintroduce a nullable client, `if (!supabase)` guards, or a
  "not configured" banner — the starter shipped those and they were removed deliberately.
- **Dev runs against local Supabase only.** `npm run dev` needs `npx supabase start` (Docker) and
  `.env` pointing at `http://127.0.0.1:54321`; @src/lib/supabase.ts throws in dev on any other host.
  Production keys live only in Vercel (Production/Preview scope, never Development), so
  `vercel env pull` must not bring them into `.env.local`, which overrides `.env`.
- **Config is read through `astro:env/server` — never `process.env`.** @src/lib/supabase.ts imports
  `SUPABASE_URL`/`SUPABASE_KEY` from `astro:env/server`, which is typed and validated against
  `env.schema`. Vercel's Cloudflare-migration guide instructs replacing `locals.runtime.env` with
  `process.env`; this codebase never used `locals.runtime.env`, so that step does not apply here.
  Following it anyway trades a validated schema for untyped globals. There are zero `process.env`
  reads in `src/` — keep it that way. Adding a variable means editing `env.schema`, then `.env`,
  then `npx astro sync`.
- **Run `npx astro sync` before `npm run lint`** on a fresh checkout or after changing
  `env.schema`. ESLint is `strictTypeChecked` + `projectService`; missing generated `.astro/`
  types produce a wall of unrelated type errors.
- **Deploy target is Vercel serverless, not Cloudflare.** `astro.config.mjs` uses
  `@astrojs/vercel` with `output: "server"`; `wrangler.jsonc` is deleted. Build writes
  `.vercel/output/`; deploy is the git integration (push to `master`) or
  `npx vercel deploy --prod`. Deploy procedure, rollback target and who may run what:
  @context/deployment/deploy-plan.md.
- **Never take adapter config from Vercel's own Astro docs.**
  `vercel.com/docs/frameworks/frontend/astro` shows the `@astrojs/vercel/serverless` subpath and
  `output: 'hybrid'` (checked 2026-09-23), both removed in Astro 5. A config copied from it fails
  to build, and the error reads as an Astro problem rather than a documentation one. `docs.astro.build` is the only
  authority for adapter config; the import is the single default export,
  `import vercel from "@astrojs/vercel"`.
- **The function's Node runtime comes from the build machine, not from a config file.** The adapter
  reads `process.version` and maps it (@node_modules/@astrojs/vercel/dist/index.js `getRuntime`);
  an unrecognised major silently falls back to `nodejs24.x`. `engines.node` in `package.json` is
  what makes Vercel's builder run 24, and `.nvmrc` is what makes your shell and CI run 24. Bump all
  three together or prod drifts from local without an error.
- **`npm run preview` does not work.** `@astrojs/vercel` ships no preview entrypoint, so
  `astro preview` dies with "Preview server process exited before becoming ready." Use
  `npm run dev`, or `npx vercel dev` for a runtime-faithful server. The `smoke` CI job serves the
  app with `npm run dev` for this reason, so it exercises the auth flow but not the built bundle.
- **The verification bar is the `verify` skill** (@.claude/skills/verify/SKILL.md), not a single
  command. Run it before declaring work done; it owns the step order and when to add the smoke
  walk. `npm run smoke` is a starter-integrity HTTP walk, not a test suite.
- **Pre-commit runs the whole-repo lint, not `lint-staged`.** @.husky/pre-commit calls
  `npm run lint` — type-aware and slow. `package.json` carries a `lint-staged` config that nothing
  invokes, so a commit is blocked by an error anywhere in the repo, not only in staged files.

## Commands

Scripts are in @package.json; only the non-obvious ones are listed here.

- `npm run build` — production SSR build into `.vercel/output/`. `npm run preview` is broken with
  this adapter — see tripwires
- `npx astro check` — type-checks `.astro` files; CI runs it, there is no npm script
- `npm run smoke` — walks sign-up → sign-in → protected page → sign-out over HTTP against a
  **running** server, and proves cross-account isolation (account B cannot see or borrow account
  A's positions or categories). Needs `BASE_URL` (default `http://localhost:4321`) and the local
  Supabase stack (`npx supabase start`). Creates two accounts per run — never point it at
  production. Run after dependency upgrades.

## Architecture

Astro 7 SSR (`output: "server"`) + React 19 islands + Tailwind 4 + Supabase auth, on Vercel
serverless functions (`nodejs24.x`).

### Request lifecycle

`src/middleware.ts` runs on every request: builds a cookie-backed Supabase SSR client, resolves
the user into `context.locals.user` (typed in @src/env.d.ts), and redirects anonymous traffic away
from anything matching `PROTECTED_ROUTES`. Add protected paths to that array — there is no
per-page auth check.

### Auth is form-POST, not fetch

Auth forms are native `<form method="POST">` posting to
`src/pages/api/auth/{signin,signup,signout}.ts`, which respond with **redirects** — errors come
back as `?error=<message>` and are rendered server-side into the React island's `serverError` prop
(@src/pages/auth/signin.astro). The React validation in @src/components/auth/SignInForm.tsx is UX
polish over a flow that works without JS. Keep new auth-adjacent forms on this pattern rather than
switching to client fetch.

## Conventions

- **Astro components** for layout/static markup. A `.tsx` component must carry a `client:*`
  directive on at least one usage — if it renders without one it has no interactivity and belongs
  in `.astro`. No Next.js directives (`"use client"`).
- **Class names**: compose with `cn()` from `@/lib/utils`; never concatenate class strings.
- **shadcn/ui** ("new-york", neutral base) lives in `src/components/ui/`. Per `components.json`,
  hooks belong in `src/hooks/` (`@/hooks`), not under `src/components/`.
- **Services / business logic** go in `src/lib/` (`src/lib/services/` once extracted); shared
  entities and DTOs in `src/types.ts` (create it when the domain model lands).
- **Supabase migrations**: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`.
  Use `/migration` to scaffold one — it applies the RLS tripwire above.
- **Formatting** is enforced, not stylistic — @.prettierrc.json is the source of truth, run
  `npm run format` rather than matching it by hand.
- **UI copy is English.**

## Environment

Node 24.21.0, pinned in `.nvmrc` (fnm switches on `cd`) and declared in `package.json`
`engines.node`. Setup is otherwise in @README.md, with one correction: its "Email confirmation in
local development" section walks you through disabling confirmations by hand in Studio, but
`supabase/config.toml` already ships `enable_confirmations = false`. Skip those steps; signup
completes without a mailbox.

## CI

@.github/workflows/ci.yml — the `ci` job needs `SUPABASE_URL`/`SUPABASE_KEY` repo secrets; `smoke`
needs none (it boots local Supabase).
