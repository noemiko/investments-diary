# Codex end-of-turn checks

`.codex/hooks.json` registers only `Stop` (120 seconds). There is no per-edit hook.

`scripts/automation/agent-hooks.mjs stop` checks the checkout resolved from the payload's `cwd`:

1. Check whether Git reports any tracked or untracked changes.
2. If changes exist, run `npm run verify` from the repository root: Astro sync, whole-repository ESLint, and unit/SSR tests.

No changes means no checks. All existing uncommitted changes count, including shell edits.
The hook checks the session checkout only; it does not track edits in other worktrees.
Local tools must be installed in that checkout. Use Node 24 from `.nvmrc`.

Failure uses exit 2 and stderr; clean completion prints `{}`. The `stop_hook_active`
retry flag permits completion after one continuation, avoiding a loop. Missing tools
and subprocess errors are reported. The internal shared subprocess budget is 110 s.

Full typecheck (`astro check`), build and decimal database tests already run in
`.github/workflows/ci.yml` on PRs. Branch protection must require the appropriate
checks to enforce a before-merge gate. This change does not configure branch protection,
change CI, or modify the existing Claude Code formatter hook or Husky pre-commit hook.

No dedicated hook protocol test file currently exists. Inspect the command wiring and JSON input/output without invoking checks when validating configuration-only changes.

Open Codex in this repository and review/trust the updated definition via `/hooks`
in Codex CLI. Confirm live delivery by asking for a change with a lint error, then
one written through a shell command. Subprocess tests do not prove host activation.

Hook protocol reference: https://learn.chatgpt.com/docs/hooks
