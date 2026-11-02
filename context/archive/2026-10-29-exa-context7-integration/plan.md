# Exa and Context7 Integration Plan

## Overview

Equip developer agents in `investments-diary` with Exa for web discovery and Context7 for library documentation. Support Codex and Claude Code through repository configuration and shared research instructions.

## Current State Analysis

At planning time, the repository had no MCP configuration. Existing client configuration covered hooks, while `AGENTS.md` linked to `CLAUDE.md` for shared instructions. The existing Astro adapter documentation rule demonstrated why retrieved examples must be checked against authoritative documentation and installed versions.

## Desired End State

Both clients discover the two services when opened in this repository. Agents use them automatically for relevant research, cite supporting sources, and disclose fallback to official documentation when a service is unavailable.

### Key Discoveries

- Shared instructions must remain agent-neutral: `CLAUDE.md:3–4`.
- Preserve the existing Astro adapter documentation-authority rule.
- Codex supports trusted project configuration through `.codex/config.toml`.
- Claude Code supports project servers through `.mcp.json`, with client approval required.

## What We're NOT Doing

Application features, runtime dependencies, database changes, global client configuration, shared 10x skill edits, paid subscriptions, or credential provisioning.

## Implementation Approach

Use hosted HTTP MCP endpoints with no credentials initially:

| Server     | Endpoint                       | Intended use                              |
| ---------- | ------------------------------ | ----------------------------------------- |
| `exa`      | `https://mcp.exa.ai/mcp`       | Discover sources and fetch relevant pages |
| `context7` | `https://mcp.context7.com/mcp` | Resolve libraries and query documentation |

Use the providers' standard tools. Avoid extra research agents, local MCP packages, proxies, and custom wrappers. Anonymous access remains subject to provider limits.

## Phase 1: Configure Repository Connections

### Overview

Make both services discoverable in both clients and document activation.

### Changes Required

**Files:** `.codex/config.toml`, `.mcp.json`

**Intent:** Add portable, repository-scoped connections.

**Contract:** Codex receives `[mcp_servers.exa]` and `[mcp_servers.context7]` tables with their URLs. Claude Code receives equivalent `mcpServers` entries with HTTP transport. Commit no authentication headers or secrets. Preserve existing client hooks and settings.

**Files:** `README.md`, `.codex/README.md`, `context/foundation/research-tools.md`

**Intent:** Provide one setup guide, linked from the existing entry points.

**Contract:** Cover endpoints, client trust/approval, fresh-session activation, connection inspection, anonymous limits, troubleshooting, and removal. Use `codex mcp list` and each client's `/mcp` interface to inspect configuration. Explain that configured servers do not prove successful tool calls. Do not add agent credentials to application environment files.

### Success Criteria

#### Automated Verification

- Both configuration files parse, with the expected server names, HTTP endpoints, and no credential fields.
- Documentation links resolve locally, and `git diff --check` passes.

#### Manual Verification

- Fresh Codex and Claude Code sessions in the repository expose both servers and their tools after normal trust/approval.

## Phase 2: Establish and Verify Research Behavior

### Overview

Define when the agents use each service and prove the workflow with representative requests.

### Changes Required

**File:** `CLAUDE.md`, preserving the `AGENTS.md` symlink

**Intent:** Make source-backed library research the default workflow.

**Contract:** Add concise, agent-neutral instructions: inspect local code and versions first; prefer Exa for discovery and inspect primary sources; prefer Context7 for library setup/configuration/API usage/adoption and resolve identity unless established; verify version compatibility independently; preserve documentation authorities and cite sources; disclose official-documentation fallback on failure, limits, missing library or unsuitable guidance; exclude private diary data, credentials and unnecessary repository content from queries.

**File:** `context/foundation/research-tools.md`

**Intent:** Make acceptance repeatable.

**Contract:** Include discovery, library-documentation, version-mismatch, and unavailable-service scenarios. Record actual client/tool results without copying full responses or secrets. A missing client or failed connection remains an incomplete live check.

### Success Criteria

#### Automated Verification

- Shared instructions remain agent-neutral, the `AGENTS.md` symlink is intact, and changed Markdown/JSON passes the existing formatter's check mode.
- Configuration and policy changes pass `git diff --check` and applicable repository verification gates.

#### Manual Verification

- Each client successfully uses Exa for a technical discovery request and returns inspected primary-source citations.
- Each client resolves a library through Context7, queries its documentation, and checks compatibility with the repository's installed version.
- An unavailable-service scenario produces a disclosed official-documentation fallback, and an incompatible example is rejected or clearly qualified.

## Testing Strategy

Use configuration parsing, formatting checks, and live client acceptance. Add no unit-test suite for static configuration.

1. Find authoritative guidance for the repository's Astro/Vercel adapter combination.
2. Resolve Supabase SSR documentation and explain cookie handling for the installed version.
3. Present guidance for a different major version and verify the agent checks compatibility.
4. Run a fresh session with a research service disabled through client controls; verify fallback and disclosure.

Run the repository's required verification workflow during implementation. Application smoke and database tests are unnecessary unless implementation expands into application code.

## Performance Considerations

Use focused queries and reuse relevant findings within a task. Avoid calling both services when one already supplies sufficient evidence. No application latency is introduced.

## Migration Notes

No data migration. Rollback removes the new server entries and research instructions. Global client settings remain untouched.

## References

- [Exa hosted MCP](https://exa.ai/mcp)
- [Context7 MCP configuration and tools](https://github.com/upstash/context7/blob/master/packages/mcp/README.md)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Claude Code project configuration](https://code.claude.com/docs/en/mcp)
- [Implementation verification](verification.md)

## Progress

### Phase 1: Configure Repository Connections

#### Automated

- [x] 1.1 Both configuration files parse, with the expected server names, HTTP endpoints, and no credential fields.
- [x] 1.2 Documentation links resolve locally, and `git diff --check` passes.

#### Manual

- [x] 1.3 Fresh Codex and Claude Code sessions in the repository expose both servers and their tools after normal trust/approval.

### Phase 2: Establish and Verify Research Behavior

#### Automated

- [x] 2.1 Shared instructions remain agent-neutral, the `AGENTS.md` symlink is intact, and changed Markdown/JSON passes the existing formatter's check mode.
- [x] 2.2 Configuration and policy changes pass `git diff --check` and applicable repository verification gates.

#### Manual

- [ ] 2.3 Each client successfully uses Exa for a technical discovery request and returns inspected primary-source citations.
- [ ] 2.4 Each client resolves a library through Context7, queries its documentation, and checks compatibility with the repository's installed version.
- [ ] 2.5 An unavailable-service scenario produces a disclosed official-documentation fallback, and an incompatible example is rejected or clearly qualified.
