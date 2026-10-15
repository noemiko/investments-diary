# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Pair `color-scheme: dark` with token-based option colours

**Context:** Dark theme / native form controls — `src/components/positions/PositionForm.tsx:166`
(`[&>option]:text-black`), together with `.dark` on `<html>` in `src/layouts/Layout.astro` and
`src/styles/global.css`.

**Problem:** The app now runs in `.dark`, but no `color-scheme: dark` is set, so native select
popups stay light. `[&>option]:text-black` is readable only because of that. Whoever later adds
`color-scheme: dark` gets black options on a dark popup in Chrome on Windows/Linux and in Firefox,
while macOS native menus hide the bug, so it passes a local check.

**Rule:** When introducing `color-scheme: dark`, replace `[&>option]:text-black` with
`[&>option]:bg-popover [&>option]:text-popover-foreground` in the same change and check a select
in Firefox.

**Applies to:** plan, implement, impl-review

## Open a pull request to run CI/CD

**Context:** Verifying a change remotely: any phase or plan check that relies on CI (`ci`, `smoke`
jobs in `.github/workflows/ci.yml`) or on a Vercel preview, after pushing a feature branch.

**Problem:** `ci.yml` triggers only on `push` to `master` and `pull_request` to `master`, so pushing
`ui-tokens-onboarding` (`8413cbf`) ran no CI at all until PR #2 was opened. A branch push looks like
"shipped for verification" while nothing runs. No Vercel preview was built for the push or the PR
either.

**Rule:** To run CI/CD on a change, open a pull request against `master` after pushing the branch; a
branch push alone runs no workflow. Do not count on a Vercel preview from the PR: until the git
integration is verified (`context/deployment/deploy-plan.md` A4), a preview check needs
`npx vercel deploy` without `--prod`.

**Applies to:** plan, implement, impl-review

## Don't half-guard migrations with `if not exists`

**Context:** Supabase migrations under `supabase/migrations/` that alter an existing table, e.g.
`20261015094649_add_position_current_price.sql:12-20` (`add column if not exists` followed by
`add constraint`).

**Problem:** The columns use `add column if not exists`, but `add constraint` has no `if not exists`
form, so re-applying the file fails at the constraints anyway. The guard suggests the migration is
safe to re-run when it isn't. Once a migration is applied in production it cannot be edited, so
the misleading guard stays in the history.

**Rule:** In a migration, use `if not exists` on every statement or on none; if a statement (e.g.
`add constraint`) has no guarded form, write the whole file unguarded.

**Applies to:** plan, implement, impl-review
