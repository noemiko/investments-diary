# Research tools

Exa supports source discovery and page retrieval. Context7 supports library resolution and
documentation queries. Both are developer tools, configured for this repository; the app
does not call either service. Shared usage rules live in [CLAUDE.md](../../CLAUDE.md), also
read through the repository's `AGENTS.md` symlink.

## Connections

| Server     | Hosted HTTP endpoint           | Standard tools                     |
| ---------- | ------------------------------ | ---------------------------------- |
| `exa`      | `https://mcp.exa.ai/mcp`       | `web_search_exa`, `web_fetch_exa`  |
| `context7` | `https://mcp.context7.com/mcp` | `resolve-library-id`, `query-docs` |

The initial configuration sends no credentials. Anonymous access is subject to provider
availability and limits; it is not a guarantee of unlimited or permanent free access.
No local MCP packages or application dependencies are needed. Tool availability can change;
inspect the live server's tool list rather than assuming a tool exists.

## Activate in Codex

1. Open this repository as the project and review/trust it through the normal client flow.
   Project `.codex/config.toml` is loaded only for trusted projects.
2. Start a fresh session after configuration changes. Existing sessions may retain their
   original tool inventory.
3. From the repository directory, run `codex mcp list` to inspect the configured servers.
   In the CLI session, use `/mcp` to inspect connection status and available tools; in the
   desktop client, inspect its MCP settings and session tool availability.
4. Run the acceptance prompts below and inspect actual tool calls and cited sources.

Do not use `codex mcp add` for this setup: the committed project configuration is the source
of these connections, and a separate registration can introduce user-level duplication.

## Activate in Claude Code

1. Open Claude Code in this repository. Review and approve the project servers from the
   root `.mcp.json` through the normal client approval flow.
2. Start a fresh session, run `/mcp`, and confirm both servers connect and expose tools.
   `claude mcp list` from the repository is an additional CLI inspection option.
3. Run the acceptance prompts below and inspect actual tool calls and cited sources.

Keep the existing `.claude/settings.json` formatter hook and `.codex/hooks.json` unchanged.
Neither client needs global configuration changes. If the same server name already exists
in local/user configuration, inspect client precedence and the effective URL rather than
adding another connection or overwriting personal settings.

## How research should work

Read relevant code and lockfile versions first. Use Exa to locate authoritative sources,
then fetch/read the primary pages supporting technical claims. Use Context7 to resolve the
intended library and query the relevant documentation; an already established exact ID can
skip resolution. Check the result against the installed or explicitly targeted version.

The existing Astro adapter authority rule still applies: use `docs.astro.build` for adapter
configuration. Search rankings and documentation snippets do not override that rule.
Cite source pages supporting decisions, and distinguish confirmed behavior from inference.
Use focused technical queries without private diary entries, credentials or unnecessary
repository content. Reuse findings within a task instead of calling both services by default.

## Failures and troubleshooting

- **Missing tools:** confirm the repository root, project trust/approval, effective server
  configuration and a fresh session. A row in `mcp list` proves registration, not a tool call.
- **Connection failure, authentication request or rate limit:** briefly disclose that the
  service could not be used and continue with official documentation through available web
  tools. Avoid repeated retries. Do not mark live acceptance successful after a fallback.
- **Exa HTTP 403 / Cloudflare 1010:** the implementation's direct Python probe was rejected
  based on its browser signature. Check the actual MCP client's connection status; a Python
  probe is not proof of native-client failure or success. If access fails there too, disclose
  the failure and use official-documentation fallback.
- **Missing library, ambiguous identity or incompatible guidance:** resolve the intended
  library using the task and installed dependency; verify primary documentation for its
  version. Do not substitute another library or silently copy a different major version.
- **Network restrictions:** check client proxy/network policy and access to the two listed
  endpoints. Follow normal approval flows for network access.
- **Future authenticated access:** treat this as a separate setup change. Keep credentials
  in supported private client storage or client environment references; never commit literal
  tokens, put them in request URLs, or add them to the application's `.env` files.

Fallback example: “Context7 is unavailable; I checked the installed version and used the
library's official documentation instead.” Cite the documentation actually inspected.

## Repeatable acceptance

Use fresh sessions in **each** client. Ask for research only; these prompts do not require
changing dependencies or application code. Record date, client, tool names, source URLs and
a short result. Do not copy full tool responses, private data or tokens.

| Scenario              | Prompt                                                                                                                                    | Pass condition                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery             | Find authoritative guidance for this repository's Astro/Vercel adapter combination.                                                       | Exa search and primary-page inspection occur; the answer cites authoritative pages and matches installed versions.                                     |
| Library documentation | Resolve Supabase SSR documentation and explain cookie handling for the installed version.                                                 | Context7 library resolution and documentation query occur; the answer checks the lockfile version and cites supporting pages.                          |
| Version mismatch      | Someone proposes `@astrojs/vercel/serverless` and `output: "hybrid"`. Check this proposal against this repository before recommending it. | The agent identifies the incompatible example using installed versions and official Astro documentation; it rejects or clearly qualifies the proposal. |
| Unavailable service   | In a fresh session with one research service disabled through client controls, repeat its research prompt.                                | The agent discloses unavailability and uses cited official documentation without claiming a successful MCP call.                                       |

Disable a service only through temporary session controls, or a temporary local working-copy
change if the client has no session toggle. Restore the original connection and restart the
session afterward; do not commit a disabled configuration or alter global client settings.

### Acceptance record

| Check                                                 | Codex   | Claude Code |
| ----------------------------------------------------- | ------- | ----------- |
| Fresh-session connection and tool inventory           | Pending | Pending     |
| Exa discovery with inspected primary-source citations | Pending | Pending     |
| Context7 resolution/query with version check          | Pending | Pending     |
| Version-mismatch handling                             | Pending | Pending     |
| Unavailable-service fallback                          | Pending | Pending     |

Live acceptance is separate from configuration parsing and direct endpoint probes. A missing
client or failed connection stays pending. Implementation verification details are recorded
in the change's [verification log](../changes/exa-context7-integration/verification.md).

## Removal

Remove the `exa` and `context7` tables from `.codex/config.toml` and the matching entries from
`.mcp.json` (remove an empty file if no other configuration remains). Remove the shared research
section and setup links if retiring the workflow. Start fresh sessions and confirm the tools
are absent. Preserve other client settings, hooks and any unrelated servers.

## References

- [Exa hosted MCP](https://exa.ai/mcp)
- [Exa server tools](https://github.com/exa-labs/exa-mcp-server)
- [Context7 MCP configuration and tools](https://github.com/upstash/context7/blob/master/packages/mcp/README.md)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Claude Code project configuration](https://code.claude.com/docs/en/mcp)
