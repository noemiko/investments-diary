---
name: verify
description: Run this repo's full static verification sequence (astro sync, lint, astro check, build) in the same order CI does. Use after making code changes, before declaring work done, or when the user asks to "verify", "check my changes", or "will CI pass".
---

# Verify

Vitest covers unit contracts and server-rendered result surfaces (`npm test`).
The sequence below is the static verification bar; run the tests as well before
reporting a code change verified. If decimal parsing, numeric DTOs, result/wallet
arithmetic, formatting or Supabase numeric projections/writes change, also run
`npm run test:decimal-db` against the running **local** Supabase stack. That command
creates disposable accounts, checks exact numeric round trips and cleans them up;
it refuses a nonlocal API URL. It never resets the diary database.

CI runs `npm test` in `ci` and the local transport test in `decimal-transport` on
qualifying pull requests and master pushes. This describes workflow wiring, not
GitHub branch-protection settings.

Run these in order, from the repo root. **Do not reorder or skip steps** — each later step
depends on artifacts the earlier ones produce.

```bash
npx astro sync      # regenerates .astro/ types, incl. astro:env/server
npm run lint        # ESLint, strictTypeChecked + projectService
npx astro check     # type-checks .astro files (no npm script exists for this)
npm run build       # production SSR build for the Vercel adapter, into .vercel/output/
```

## Reading the output

- **`npm run lint` explodes with dozens of unrelated type errors** — almost always stale
  generated types, not real errors. `npx astro sync` was skipped or `env.schema` in
  `astro.config.mjs` changed. Re-run `astro sync` and lint again before investigating.
- **`no-console` is a warning, not an error** — it does not fail the run. `scripts/**/*.mjs` is
  exempt from it entirely.
- **Build fails without Supabase configured.** `SUPABASE_URL`/`SUPABASE_KEY` are
  `optional: false` in `env.schema`, so a missing variable is a build error, not a silently
  logged-out site. A green build proves the variables are _set_, not that they reach a working
  Supabase. Only the smoke walk below proves that.

## Fixing

Auto-fixable lint and formatting issues: `npm run lint:fix` then `npm run format`. Re-run the
full sequence afterwards — `lint:fix` can introduce changes that `astro check` rejects.

## When static checks are not enough

If the change touches the auth flow (`src/middleware.ts`, `src/pages/api/auth/*`,
`src/pages/auth/*`), also run the end-to-end smoke walk. It needs a **running** server and a
**local** Supabase stack (Docker) with email confirmation disabled:

```bash
npx supabase start                  # if not already running; .env must point at http://127.0.0.1:54321
npm run dev -- --port 4321 &        # not `npm run preview`: the Vercel adapter has no preview server
BASE_URL=http://localhost:4321 npm run smoke
npx astro dev stop                  # Astro 7 keeps the dev server running as a background daemon
```

Never point `BASE_URL` at production. The walk creates a real account on every run.

Report which steps passed and paste the actual failure output for any that did not. Do not
describe a run as verified if a step was skipped.
