# Codex end-of-turn checks

`.codex/hooks.json` registers only `Stop` (120 seconds). There is no per-edit hook.

`scripts/automation/agent-hooks.mjs stop` checks the checkout resolved from the payload's `cwd`:

1. Check whether Git reports any tracked or untracked changes.
2. If changes exist, run `npm run verify` from the repository root: Astro sync, whole-repository ESLint, and unit/SSR tests.


## Research tools

`config.toml` also declares the repository's Exa and Context7 HTTP MCP connections.
See [Research tools](../context/foundation/research-tools.md) for project trust,
fresh-session activation, connection checks and acceptance scenarios. These connections
use no credentials initially; the hook configuration above remains independent.
