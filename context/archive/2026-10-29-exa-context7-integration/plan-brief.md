# Exa and Context7 Integration — Plan Brief

> Full plan: [plan.md](plan.md)

## What & Why

Add developer research tools to improve source discovery and reduce outdated library guidance. Exa handles discovery; Context7 supplies library documentation.

## Starting Point

At planning time, no repository MCP configuration existed. Both clients already shared agent instructions and had separate hook configuration.

## Desired End State

Both clients can call both services and follow the same version-aware research policy, with official-documentation fallback.

## Key Decisions Made

| Decision       | Choice                       | Reason                                   |
| -------------- | ---------------------------- | ---------------------------------------- |
| Audience       | Developer agents             | Improve research and library adoption    |
| Clients        | Codex and Claude Code        | Support both existing workflows          |
| Reach          | This repository              | Keep configuration reviewable            |
| Authentication | Keyless initially            | Avoid credential setup                   |
| Usage          | Prefer tools, allow fallback | Keep research productive during failures |

## Scope

**Included:** Project MCP configuration, shared usage rules, setup documentation, live acceptance.

**Excluded:** Application integration, global settings, shared 10x skills, credentials, new runtime dependencies.

## Architecture / Approach

Clients connect directly to hosted services. Shared instructions govern source selection, version checks, citations, and fallback.

## Phases at a Glance

| Phase | Deliverable                    | Key risk                                  |
| ----- | ------------------------------ | ----------------------------------------- |
| 1     | Connections and setup guide    | Client activation or anonymous limits     |
| 2     | Research policy and acceptance | Tools configured but unused or unsuitable |

**Prerequisites:** Network access and both clients available for acceptance. Claude Code was not found on this shell's `PATH` during planning.

**Estimated effort:** One small implementation session plus live client verification.

## Open Risks & Assumptions

- Anonymous access and available tools may change; connection failures must remain visible.
- Context7 may lack documentation for an exact installed version.
- Live acceptance is separate from configuration validation; see [verification](verification.md) for current results.

## Success Criteria (Summary)

- Both clients successfully call both services.
- Research includes authoritative citations and version checks.
- Service failures lead to disclosed official-documentation fallback.

## References

Provider/client references and canonical execution Progress are in the [full plan](plan.md).
