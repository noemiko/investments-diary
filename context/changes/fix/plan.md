# Resolve HIGH dependency findings — Implementation Plan

## Overview

Resolve all 10 HIGH dependency entries identified in the health check, then add CI checks that reject HIGH/CRITICAL findings. Use targeted transitive updates within existing dependency ranges.

## Current State Analysis

The refreshed audit confirms 0 CRITICAL, 10 HIGH and 23 MODERATE affected package entries. Several HIGH entries propagate from the same advisory. The project has strict TypeScript, Vitest, CI and local auth smoke. Private registry access previously returned E401; authenticated installation is a prerequisite.

## Desired End State

Both application and reviewer dependency audits report zero HIGH/CRITICAL findings. Clean installation, existing static checks, unit tests and local auth smoke pass on Node 24.21.0. CI enforces the same threshold.

### Key Discoveries

- Vercel functions → OIDC → CLI configuration → nested Zod accounts for four HIGH entries.
- Existing dependency ranges permit patched releases for all affected chains.
- `npm run verify` alone omits Astro check and build.
- Dependency upgrades require local smoke; agent actions in Vercel cloud are prohibited.

## What We're NOT Doing

MODERATE-only remediation, broad upgrades, new global overrides, forced audit fixes, application API/type/route changes, database changes, Dependabot, expanded browser CI, unrelated configuration fixes, deployment or merging.

## Implementation Approach

Refresh affected transitives, preserve direct declarations and existing overrides, inspect every nested vulnerable copy, and accept only a clean install and fresh audit. Verified candidates: functions 3.11.0, OIDC 4.0.7, CLI config 0.3.7, Zod >=4.6.6; brace-expansion 1.1.22/5.0.13; devalue 5.9.4; sharp 0.35.5; source-map-js 1.2.2; undici 8.12.2; Vite 8.3.8. These are candidates, not an already-tested resolution.

## Phase 1: Refresh affected dependency chains

### Overview

Refresh affected dependency chains.

### Changes Required

**File:** `package-lock.json`

**Intent:** Remove vulnerable transitive resolutions with minimal unrelated churn.

**Contract:** Preserve direct declarations, Node 24 compatibility, private registry routing and existing overrides. Update every affected nested copy. Under Node 24.21.0 run `npm update @vercel/functions brace-expansion devalue sharp source-map-js undici vite`. Inspect the Vercel chain rather than updating its exactly pinned nested Zod independently; do not add transitives as direct dependencies. If authentication fails, report the prerequisite without changing credentials. If resolution cannot remove HIGH findings within these constraints, stop and revise the plan rather than force broader upgrades.

### Success Criteria

#### Automated Verification

- Clean installation succeeds with Node 24.21.0.
- Both dependency trees report zero HIGH/CRITICAL findings.
- Dependency inspection confirms patched resolutions for all 10 baseline HIGH entries.

## Phase 2: Enforce the audit threshold in CI

### Overview

Enforce the audit threshold in CI.

### Changes Required

**File:** `.github/workflows/ci.yml`

**Intent:** Detect newly disclosed HIGH/CRITICAL vulnerabilities in existing CI.

**Contract:** Add separate blocking steps after the respective installations: `npm audit --audit-level=high --registry=https://registry.npmjs.org` and `npm audit --prefix scripts/review --audit-level=high --registry=https://registry.npmjs.org`. Include development dependencies. Preserve installation authentication and scoped registry routing; no continue-on-error or failure suppression.

### Success Criteria

#### Automated Verification

- Both exact CI audit commands exit successfully.
- Workflow configuration contains both blocking audit steps after the corresponding installations.

## Phase 3: Verify behavior and record evidence

### Overview

Verify behavior and record evidence.

### Changes Required

**File:** `context/changes/fix/verification.md`

**Intent:** Record reproducible remediation evidence without rewriting historical health checks.

**Contract:** Record runtime versions, affected resolutions, before/after audit counts, commands and results, remaining MODERATE findings. Exclude credentials and personal paths. Run on Node 24.21.0, in order: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`; then `npm test`, `node --test scripts/review/review.test.mjs`, `npm run check:sentry-build`. Run `BASE_URL=http://localhost:4321 npm run smoke` against Docker/local Supabase and the local app. Confirm local app/backend targets. Stop only processes started for this verification; preserve local data and existing services.

### Success Criteria

#### Automated Verification

- Static verification, unit tests and reviewer tests pass on Node 24.21.0.
- Build artifact privacy checks and local auth smoke pass.
- Final audits retain zero HIGH/CRITICAL findings and verification evidence is recorded.

## Testing Strategy

Reuse existing tests; no new application tests are needed. Verify clean installation, compilation, existing business logic, public build privacy, local sign-in/sign-out and account isolation. Failed installs, missing services or skipped required checks remain incomplete. Browser discovery is not execution. Existing CI database and decision-history jobs stay unchanged.

## Performance Considerations

No intentional performance change. Avoid unrelated runtime/compiler upgrades.

## Migration Notes

No data migration. Roll back the lockfile and CI changes together, reinstall, and verify. Deployment is outside this plan.

## References

- `context/foundation/health-check-v2.md`
- `package.json:38–49`, overrides at `package.json:92`
- `.claude/skills/verify/SKILL.md`
- `AGENTS.md:89–94`
- `.github/workflows/ci.yml`
- `context/foundation/lessons.md`
- https://docs.npmjs.com/cli/v11/commands/npm-update/
- https://docs.npmjs.com/cli/v11/commands/npm-audit/

## Progress

### Phase 1: Refresh affected dependency chains

#### Automated

- [x] 1.1 Clean installation succeeds with Node 24.21.0.
- [x] 1.2 Both dependency trees report zero HIGH/CRITICAL findings.
- [x] 1.3 Dependency inspection confirms patched resolutions for all 10 baseline HIGH entries.

### Phase 2: Enforce the audit threshold in CI

#### Automated

- [x] 2.1 Both exact CI audit commands exit successfully.
- [x] 2.2 Workflow configuration contains both blocking audit steps after the corresponding installations.

### Phase 3: Verify behavior and record evidence

#### Automated

- [x] 3.1 Static verification, unit tests and reviewer tests pass on Node 24.21.0.
- [x] 3.2 Build artifact privacy checks and local auth smoke pass.
- [x] 3.3 Final audits retain zero HIGH/CRITICAL findings and verification evidence is recorded.
