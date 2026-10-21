# Codex end-of-turn checks

`.codex/hooks.json` registers only `Stop` (120 seconds). There is no per-edit hook.

`scripts/agent-hooks.mjs stop` checks the checkout resolved from the payload's `cwd`:

1. Collect tracked changes against HEAD and untracked, non-ignored files.
2. If supported source files changed, run `astro sync` (generated-type prerequisite), then ESLint on those files.
3. Run the full unit/SSR suite with `vitest run`.

No changes means no checks. Deleted and unsupported files are excluded from lint.
All existing uncommitted changes count, including edits made through shell commands.
The hook checks the session checkout only; it does not track edits in other worktrees.
Local tools must be installed in that checkout. Use Node 24 from `.nvmrc`.

Failure uses exit 2 and stderr; clean completion prints `{}`. The `stop_hook_active`
retry flag permits completion after one continuation, avoiding a loop. Missing tools
and subprocess errors are reported. The internal shared subprocess budget is 110 s.

Full typecheck (`astro check`), build and decimal database tests already run in
`.github/workflows/ci.yml` on PRs. Branch protection must require the appropriate
checks to enforce a before-merge gate. This change does not configure branch protection,
change CI, or modify the existing Claude Code formatter hook or Husky pre-commit hook.

Protocol tests: `npx vitest run scripts/__tests__/agent-hooks.test.ts` (also in `npm test`).
They use disposable repositories, the real hook, real Git and stub external check tools.
Coverage includes shell edits, lint/test failures, retry, clean/deleted/unsupported files,
missing tools, malformed payloads, cwd resolution and the configured worktree command.

Open Codex in this repository and review/trust the updated definition via `/hooks`
in Codex CLI. Confirm live delivery by asking for a change with a lint error, then
one written through a shell command. Subprocess tests do not prove host activation.

Hook protocol reference: https://learn.chatgpt.com/docs/hooks
