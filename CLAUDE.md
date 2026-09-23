# CLAUDE.md

Do not name a specific agent below this line. `AGENTS.md` is a symlink to this file, so Codex and
Copilot read the same bytes.

## What this repo is

**Investments Diary** — a private, single-user investment journal that records the *reason*
behind each buy/sell and confronts the author with comparable past positions at decision time.
Product context: @context/foundation/prd.md (requirements), @context/foundation/tech-stack.md
(why this stack). Read the PRD before adding domain features; do not invent domain rules.

The code is the `10x-astro-starter` scaffold, renamed and migrated from Cloudflare to Vercel —
auth works, no domain model exists yet.

## Tripwires (read before editing)

- **Every new Supabase table needs RLS enabled**, with granular per-operation, per-role policies.
  The diary is single-user but the data is private by design, and a missing policy fails silently —
  nothing errors, the rows are just readable. This fires on the first domain migration.
- **Supabase env vars are required, not optional.** `SUPABASE_URL`/`SUPABASE_KEY` are
  `optional: false` in `astro.config.mjs` `env.schema`, so a missing value fails at startup rather
  than degrading. The `null` return in @src/lib/supabase.ts, the caller guards in
  @src/middleware.ts, and the banner in @src/lib/config-status.ts date from when both were optional
  and can now only fire on an empty-string value. Treat them as dead, not load-bearing.
- **Config is read through `astro:env/server` — never `process.env`.** @src/lib/supabase.ts imports
  `SUPABASE_URL`/`SUPABASE_KEY` from `astro:env/server`, which is typed and validated against
  `env.schema`. Vercel's Cloudflare-migration guide instructs replacing `locals.runtime.env` with
  `process.env`; this codebase never used `locals.runtime.env`, so that step does not apply here.
  Following it anyway trades a validated schema for untyped globals. There are zero `process.env`
  reads in `src/` — keep it that way.
- **Run `npx astro sync` before `npm run lint`** on a fresh checkout or after changing
  `env.schema`. ESLint is `strictTypeChecked` + `projectService`; missing generated `.astro/`
  types produce a wall of unrelated type errors.
- **Deploy target is Vercel serverless, not Cloudflare.** `astro.config.mjs` uses
  `@astrojs/vercel` with `output: "server"`; `wrangler.jsonc` is deleted. Build writes
  `.vercel/output/`; deploy is `npx vercel deploy --prod` or the git integration. `tech-stack.md`
  still says `cloudflare-pages` — it is stale.
- **Never take adapter config from Vercel's own Astro docs.**
  `vercel.com/docs/frameworks/frontend/astro` still shows the `@astrojs/vercel/serverless` subpath
  and `output: 'hybrid'`, both removed in Astro 5. A config copied from it fails to build, and the
  error reads as an Astro problem rather than a documentation one. `docs.astro.build` is the only
  authority for adapter config; the import is the single default export,
  `import vercel from "@astrojs/vercel"`.
- **The function's Node runtime comes from the build machine, not from a config file.** The adapter
  reads `process.version` and maps it (@node_modules/@astrojs/vercel/dist/index.js `getRuntime`);
  an unrecognised major silently falls back to `nodejs24.x`. `engines.node` in `package.json` is
  what makes Vercel's builder run 24, and `.nvmrc` is what makes your shell and CI run 24. Bump all
  three together or prod drifts from local without an error.
- **`npm run preview` does not work.** `@astrojs/vercel` ships no preview entrypoint, so
  `astro preview` dies with "Preview server process exited before becoming ready." Use
  `npm run dev`, or `npx vercel dev` for a runtime-faithful server. The `smoke` CI job still calls
  it and is broken until that changes.
- **No test framework exists.** `npm run smoke` is a starter-integrity HTTP walk, not a test
  suite. Verify changes with `npm run lint` → `npx astro check` → `npm run build`.
- **Pre-commit runs the whole-repo lint, not `lint-staged`.** @.husky/pre-commit calls
  `npm run lint` — type-aware and slow. `package.json` carries a `lint-staged` config that nothing
  invokes, so a commit is blocked by an error anywhere in the repo, not only in staged files.

## Commands

- `npm run dev` — Astro dev server on Node (port 4321)
- `npm run build` — production SSR build into `.vercel/output/`. `npm run preview` is broken with
  this adapter — see tripwires
- `npm run lint` · `npm run lint:fix` — ESLint, type-aware rules (slow)
- `npm run format` — Prettier (astro + tailwind class-sorting plugins)
- `npx astro check` — type-checks `.astro` files; CI runs it, there is no npm script
- `npm run smoke` — walks sign-up → sign-in → protected page → sign-out over HTTP against a
  **running** server. Needs `BASE_URL` (default `http://localhost:4321`) and a reachable Supabase
  with email confirmation disabled. Run after dependency upgrades.

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

### Env access

Secrets come from `astro:env/server`. Adding a variable means editing `env.schema` in
`astro.config.mjs`, then `.env`, then `npx astro sync`. `.dev.vars` was Cloudflare-only and no
longer exists.

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

Node 24.21.0, pinned in `.nvmrc` (fnm switches on `cd`) and declared in `package.json`
`engines.node`. Setup is otherwise in @README.md, with two corrections:

- The README's "Email confirmation in local development" section walks you through disabling
  confirmations by hand in Studio, but `supabase/config.toml` already ships
  `enable_confirmations = false`. Skip those steps; signup completes without a mailbox.
- The README still documents Cloudflare Workers, `wrangler deploy` and `.dev.vars` throughout. All
  of that is stale — see the deploy tripwire above.

## CI

@.github/workflows/ci.yml runs on push/PR to `master`, both jobs taking their Node version from
`.nvmrc` via `node-version-file`. The `ci` job needs `SUPABASE_URL` and `SUPABASE_KEY` repo
secrets; the `smoke` job needs none — it boots its own local Supabase, but is currently broken
because it serves the app with `npm run preview`.
