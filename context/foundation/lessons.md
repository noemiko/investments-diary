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

## Keep automatic agents out of Vercel cloud

- **Context**: Verification steps run by an automatic agent during /10x-implement and /10x-impl-review (previews, smoke checks, deployment validation), e.g. the automatic-stock-prices change.
- **Problem**: The agent created and removed Vercel deployments (`vercel deploy`, `vercel remove`) in the live project, which also hosts production and real diary data. One wrong flag or target could change production.
- **Rule**: automatic agent shouldn't ask or run anything in vercel cloud;
- **Applies to**: all

## Never write local user paths into documentation

- **Context**: Any context/ artifact written by a skill: plans, research, verification logs, foundation docs.
- **Problem**: An absolute path such as /Users/<name>/Documents/... reveals the user's personal username and machine layout to anyone the repo is shared with.
- **Rule**: do not write in any documentation user local path to the project
- **Applies to**: all

## Give registered users access to only their own rows in new tables

- **Context**: Any phase that adds a migration creating a new table in investments-diary
- **Problem**: Registered users get empty results or permission errors on a new table.
- **Rule**: Users should have access to only their own rows.
- **Applies to**: implement, impl-review
