# Implementation verification

Date: 2026-10-29

## Local checks

- TOML and JSON parsing passed. Both configurations contain exactly the two approved
  server names/endpoints, with no credential fields.
- Eleven local documentation links resolve. All eight Success Criteria map one-to-one
  to canonical Progress rows.
- `AGENTS.md` remains a symlink to `CLAUDE.md`; the new shared policy is agent-neutral.
- Existing hooks, client formatter settings, application code and dependency manifests
  were unchanged.
- Changed Markdown/JSON passed the installed Prettier check.
- `git diff --check` passed.
- Required repository verification passed, in order: `npx astro sync`, `npm run lint`,
  `npx astro check` (130 files; zero errors, warnings or hints), `npm run build`, then
  `npm test` (24 files, 282 tests passed). Used the pinned Node 24.21.0 runtime.

## Configuration inspection

The installed `codex-cli 0.165.0-alpha.1.2` returned no `exa` or `context7` rows from
`codex mcp list --json` in this checkout. No matching checkout trust entry was found
in the user's configuration. Project activation is therefore **not verified**; follow
the normal project trust/fresh-session steps in the setup guide. User configuration
and project trust were not changed. Only server names, effective transport/URL fields
and trust labels were inspected/reported; no credentials were printed.

## Direct endpoint probes

Sandbox DNS was unavailable; public read-only probes were rerun with approved network
access. These are protocol probes, not calls through either coding client.

| Service  | Actual result                                                                                                                                                    | Interpretation                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context7 | Anonymous MCP initialize returned HTTP 200 (server 4.4.3); tools/list exposed `resolve-library-id` and `query-docs`; `resolve-library-id` found `/supabase/ssr`. | Anonymous connection, tool discovery and library resolution work from this environment. Documentation query and client activation were not tested. |
| Exa      | Initialize and tools/list returned HTTP 403, Cloudflare error 1010 `browser_signature_banned`.                                                                   | This Python HTTP probe was rejected based on its browser signature. Native-client access remains unverified; no tool-call success is claimed.      |

Context7 listed Supabase SSR versions `v0.12.5` and `v0.12.0`, while the repository
declares `@supabase/ssr` 0.12.7. Library resolution alone therefore does not establish
version compatibility. The implemented policy requires checking authoritative sources
for the installed version and disclosing any fallback.

## Live acceptance

Fresh-session acceptance remains pending for both clients. The current chat does not expose
Exa or Context7 tools, and Claude Code is not installed on this shell's `PATH`. Configuration
inspection and direct endpoint probes do not prove client activation or agent behavior.

Use the [research-tools acceptance scenarios](../../foundation/research-tools.md#repeatable-acceptance)
to complete the manual Progress rows. Do not mark them complete on the basis of static checks.

All four automated Progress rows are complete; all four manual rows remain pending.
The change stays `implementing` until live acceptance is completed. No commits were created.
