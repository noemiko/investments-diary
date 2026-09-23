# CLAUDE.md

Do not name a specific agent below this line. `AGENTS.md` is a symlink to this file, so Codex and
Copilot read the same bytes.

## What this repo is

**Investments Diary** — a private, single-user investment journal that records the *reason*
behind each buy/sell and confronts the author with comparable past positions at decision time.
Product context: @context/foundation/prd.md (requirements), @context/foundation/tech-stack.md
(why this stack). Read the PRD before adding domain features; do not invent domain rules.

The code is still the unmodified `10x-astro-starter` scaffold — auth works, no domain model
exists yet.

## Tripwires (read before editing)

- **Every new Supabase table needs RLS enabled**, with granular per-operation, per-role policies.
  The diary is single-user but the data is private by design, and a missing policy fails silently —
  nothing errors, the rows are just readable. This fires on the first domain migration.
- **`createClient()` can return `null`.** `SUPABASE_URL`/`SUPABASE_KEY` are `optional: true` in
  `astro.config.mjs` `env.schema`, so the app boots unconfigured and shows a banner
  (@src/lib/config-status.ts) instead of crashing. Every caller null-checks — see
  @src/middleware.ts and @src/pages/api/auth/signin.ts. Do not remove those guards.
- **Run `npx astro sync` before `npm run lint`** on a fresh checkout or after changing
  `env.schema`. ESLint is `strictTypeChecked` + `projectService`; missing generated `.astro/`
  types produce a wall of unrelated type errors.
- **Deploy target is Cloudflare Workers, not Pages.** `wrangler.jsonc` has `main` +
  `assets.binding` ⇒ `npx wrangler deploy`. `wrangler pages deploy` will not work here, despite
  `deployment_target: cloudflare-pages` in `tech-stack.md`.
- **No test framework exists.** `npm run smoke` is a starter-integrity HTTP walk, not a test
  suite. Verify changes with `npm run lint` → `npx astro check` → `npm run build`.
- **Pre-commit hooks do not run.** No git repository is initialised and `package.json` has no
  `prepare` script, so husky is not installed. Run `npm run lint:fix` and `npm run format` by
  hand until `git init` + `npx husky init` happens.
- **Identity strings still say `10x-astro-starter`**: `package.json` `name`, `wrangler.jsonc`
  `name`, `supabase/config.toml` `project_id`, and the default title in @src/layouts/Layout.astro.
  Rename the worker *before* the first deploy — renaming after creates a second worker.

## Commands

- `npm run dev` — dev server on the Cloudflare workerd runtime (port 4321)
- `npm run build` / `npm run preview` — production SSR build / local preview on workerd
- `npm run lint` · `npm run lint:fix` — ESLint, type-aware rules (slow)
- `npm run format` — Prettier (astro + tailwind class-sorting plugins)
- `npx astro check` — type-checks `.astro` files; CI runs it, there is no npm script
- `npm run smoke` — walks sign-up → sign-in → protected page → sign-out over HTTP against a
  **running** server. Needs `BASE_URL` (default `http://localhost:4321`) and a reachable Supabase
  with email confirmation disabled. Run after dependency upgrades.

## Architecture

Astro 7 SSR (`output: "server"`) + React 19 islands + Tailwind 4 + Supabase auth, on Cloudflare
Workers.

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

### Env access

Secrets come from `astro:env/server`. Adding a variable means editing `env.schema` in
`astro.config.mjs`, then `.env` (Node) **and** `.dev.vars` (Cloudflare local dev), then
`npx astro sync`.

## Conventions

- **Path alias** `@/*` → `./src/*`.
- **Astro components** for layout/static markup. A `.tsx` component must carry a `client:*`
  directive on at least one usage — if it renders without one it has no interactivity and belongs
  in `.astro`. No Next.js directives (`"use client"`).
- **Class names**: compose with `cn()` from `@/lib/utils`; never concatenate class strings.
- **shadcn/ui** ("new-york", neutral base) lives in `src/components/ui/`. Per `components.json`,
  hooks belong in `src/hooks/` (`@/hooks`), not under `src/components/`.
- **Services / business logic** go in `src/lib/` (`src/lib/services/` once extracted); shared
  entities and DTOs in `src/types.ts` (create it when the domain model lands).
- **Supabase migrations** (none yet): `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`.
  Use `/migration` to scaffold one — it applies the RLS tripwire above.
- **Formatting** is enforced, not stylistic — @.prettierrc.json is the source of truth, run
  `npm run format` rather than matching it by hand. `no-console` is a warning, and
  `scripts/**/*.mjs` is exempt from it.
- **UI copy is English.** The one exception is the config banner in `src/lib/config-status.ts`,
  which is still Polish — translate it when it is next touched.

## Environment

Setup is in @README.md — Node version, `.env` / `.dev.vars`, local Supabase, Docker RAM. One
correction to it: the README's "Email confirmation in local development" section walks you through
disabling confirmations by hand in Studio, but `supabase/config.toml` already ships
`enable_confirmations = false`. Skip those steps; signup completes without a mailbox.

## CI

@.github/workflows/ci.yml runs on push/PR to `master`. The `ci` job needs `SUPABASE_URL` and
`SUPABASE_KEY` repo secrets; the `smoke` job needs none — it boots its own local Supabase.
