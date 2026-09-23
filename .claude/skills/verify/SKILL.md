---
name: verify
description: Run this repo's full static verification sequence (astro sync, lint, astro check, build) in the same order CI does. Use after making code changes, before declaring work done, or when the user asks to "verify", "check my changes", or "will CI pass".
---

# Verify

There is no test framework in this repo. This sequence is the verification bar.

Run these in order, from the repo root. **Do not reorder or skip steps** — each later step
depends on artifacts the earlier ones produce.

```bash
npx astro sync      # regenerates .astro/ types, incl. astro:env/server
npm run lint        # ESLint, strictTypeChecked + projectService
npx astro check     # type-checks .astro files (no npm script exists for this)
npm run build       # production SSR build for the Cloudflare adapter
```

## Reading the output

- **`npm run lint` explodes with dozens of unrelated type errors** — almost always stale
  generated types, not real errors. `npx astro sync` was skipped or `env.schema` in
  `astro.config.mjs` changed. Re-run `astro sync` and lint again before investigating.
- **`no-console` is a warning, not an error** — it does not fail the run. `scripts/**/*.mjs` is
  exempt from it entirely.
- **Build succeeds without Supabase configured.** `SUPABASE_URL`/`SUPABASE_KEY` are
  `optional: true`, so a green build does not prove the app is wired to a database.

## Fixing

Auto-fixable lint and formatting issues: `npm run lint:fix` then `npm run format`. Re-run the
full sequence afterwards — `lint:fix` can introduce changes that `astro check` rejects.

## When static checks are not enough

If the change touches the auth flow (`src/middleware.ts`, `src/pages/api/auth/*`,
`src/pages/auth/*`), also run the end-to-end smoke walk. It needs a **running** server and a
reachable Supabase with email confirmation disabled:

```bash
npx supabase start                  # if not already running
npm run build && npm run preview &  # or: npm run dev
BASE_URL=http://localhost:4321 npm run smoke
```

Report which steps passed and paste the actual failure output for any that did not. Do not
describe a run as verified if a step was skipped.
