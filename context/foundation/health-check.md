---
project: investments-diary
checked_at: 2026-09-24T11:09:37Z
health_status: critical-issues
context_type: greenfield
language_family: js
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 0
  low: 0
test_runner_detected: false
ci_provider: GitHub Actions
recommended_fixes: 8
---

# Health Check — investments-diary

> Note: the PRD declares `context_type: greenfield` (the project was bootstrapped with the
> toolkit). This audit was run on the scaffolded-and-extended codebase as a checkpoint
> after the walking skeleton (auth + first deploy), before feature work starts.
>
> **Re-run.** Since the previous check (2026-09-24T10:51:43Z), the three HIGH advisories were
> fixed by pinning `path-to-regexp` through `overrides`. Nothing else in the report has changed.

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm (11.19.0, Node 24.21.0 — matches .nvmrc and engines "24.x")
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
Direct vs transitive: no findings
```

Resolved since the last run: [GHSA-9wv6-86v2-598j](https://github.com/advisories/GHSA-9wv6-86v2-598j), a ReDoS in `path-to-regexp` that npm reported three times (once per package in the chain) through `@astrojs/vercel@11.0.11 → @vercel/routing-utils@6.6.0`. `package.json` now has an `overrides` entry, `"@vercel/routing-utils": { "path-to-regexp": "6.3.0" }`. `npm ls` shows `path-to-regexp@6.3.0 overridden`, and `npm run build` still succeeds.

### Outdated Dependencies

```
Packages with major version gaps: 3 (none 2+ majors behind)
```

- **typescript**: 6.0.3 → 7.0.2 (1 major behind; devDependency)
- **@astrojs/react**: 6.0.5 → 7.0.0 (1 major behind)
- **lint-staged**: 16.4.0 → 17.5.1 (1 major behind; devDependency)

Minor/patch updates available within the current ranges: astro 7.3.5, @supabase/supabase-js 2.117.1, eslint 10.11.0, eslint-plugin-astro 3.2.1, lucide-react 1.48.0, prettier 3.9.9, prettier-plugin-astro 1.0.1, typescript-eslint 8.70.1, @astrojs/react 6.0.6.

## Test Suite

```
Test runner: not detected
Tests found: 0 unit/integration tests; 1 HTTP smoke script (scripts/smoke.mjs)
Test execution: not attempted (smoke script needs a running dev server + local Supabase)
```

`scripts/smoke.mjs` is a real, useful end-to-end check. It covers the auth flow over HTTP (redirects, cookies, gating) and runs in CI. But it isn't a test runner: it needs a live server and database, it takes no per-file targeting, and it can't exercise pure logic in isolation.

⚠ No test runner detected. The agent cannot verify its own changes.
Recommended: Vitest, which is Vite-native and shares Astro's Vite config through `getViteConfig`. It matters most for the PRD's core business rule ("show every earlier position with the same reason, each with its outcome"). That rule is pure logic: outcome calculation, open vs closed, gain vs loss. It's exactly the kind of code an agent should unit-test before touching the UI.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml (jobs: ci, smoke; on push/PR to master)
```

| Stage      | Status | Notes                                                                 |
|------------|--------|-----------------------------------------------------------------------|
| Lint       | ✓      | `npm run lint` (ESLint 10 + prettier via eslint-plugin-prettier; passes locally) |
| Test       | ~      | Smoke job only (local Supabase + dev server + `npm run smoke`); no unit tests |
| Build      | ✓      | `npm run build` (with Supabase secrets; passes locally)               |
| Type check | ✓      | `npx astro check` (verified locally: 0 errors, 0 warnings, 0 hints)   |
| Security   | ✗      | No `npm audit`, Dependabot, or CodeQL                                 |

## Configuration

### High severity

No gaps. `.gitignore` is present, `tsconfig.json` extends `astro/tsconfigs/strict`, and ESLint and Prettier are configured.

### Medium severity

- **Pre-commit hook skips lint-staged** — `.husky/pre-commit` runs `npm run lint`, which lints the whole repo but doesn't fix anything. The `lint-staged` block in `package.json` (eslint --fix, prettier --write on staged files) never runs. Formatting for `*.json/css/md` isn't enforced at commit time. Fix: replace the hook body with `npx lint-staged`.

### Low severity

- **`path-to-regexp` override is undocumented** — the new `overrides` entry has no explanation in the repo. `package.json` can't hold comments, and `CLAUDE.md` doesn't mention it. An agent tidying dependencies may remove it as clutter, which brings the advisory back. Fix: add a one-line tripwire to `CLAUDE.md`.
- **`.editorconfig`** — missing. Prettier covers most formatting, but editors (and agents writing files outside Prettier's glob) have no shared indent or EOL defaults. Fix: add a minimal `.editorconfig`.
- **`.gitignore` pattern `.env*`** — this also matches `.env.example`. The file is only kept because it was committed before the rule was added. Any new env template, or a re-created `.env.example`, will be silently ignored. Fix: add `!.env.example` after `.env*`.
- **No `supabase/migrations/`** — the database schema isn't under version control yet (expected, since only auth exists). Once the investments and reasons tables arrive, an agent can only see and reason about the schema if it lives in migrations. Fix: create each table change with `npx supabase migration new <name>`.

## Stack Assessment Cross-Reference

No stack-assessment.md found. Run /10x-stack-assess for quality-gate analysis. (For this project, the stack was picked via `/10x-tech-stack-selector`, and `context/foundation/tech-stack.md` holds that rationale.)

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Add a unit test runner (Vitest)

**Impact**: Without a runner, the agent can't check its own changes to business logic. The only automated check is an end-to-end smoke test that needs a live server and database. The PRD's central rule (matching earlier positions by reason and computing their outcomes) is pure logic and should be covered by fast unit tests the agent runs after every edit.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```bash
npm install -D vitest
```

Create `vitest.config.ts`:

```ts
/// <reference types="vitest" />
import { getViteConfig } from "astro/config";

export default getViteConfig({ test: {} });
```

Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts, add one test next to the first piece of logic (e.g. `src/lib/*.test.ts`), then add `- run: npm test` to the `ci` job in `.github/workflows/ci.yml`.

### 2. Apply in-range minor/patch updates

**Impact**: Keeps the lockfile close to current releases, so agent-generated code matches the docs it reads.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm update && npm ls path-to-regexp && npm run lint && npx astro check && npm run build
```

`npm ls path-to-regexp` confirms the override still applies after the update. Treat the three major bumps (typescript 7, @astrojs/react 7, lint-staged 17) as separate, deliberate changes, one per commit, each with `astro check` + build. None is urgent.

### 3. Make the pre-commit hook use lint-staged

**Impact**: Agent commits get auto-fixed and formatted on the staged files, instead of a slow whole-repo lint that only reports.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

```bash
echo "npx lint-staged" > .husky/pre-commit
```

Then update the matching tripwire in `CLAUDE.md` ("Pre-commit runs the whole-repo lint, not `lint-staged`").

### 4. Document the path-to-regexp override

**Impact**: Tells future agents (and you) the override is deliberate, and when it can be removed.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add to the Tripwires section of `CLAUDE.md`:

```markdown
- **`overrides` pins `path-to-regexp@6.3.0` under `@vercel/routing-utils`** — upstream pins the
  vulnerable 6.1.0 exactly (GHSA-9wv6-86v2-598j). Keep it until a `@vercel/routing-utils` release
  drops that pin; never "fix" it with `npm audit fix --force`, which downgrades `@astrojs/vercel`.
```

### 5. Add a security check to CI

**Impact**: New advisories show up on PRs instead of only when someone runs `npm audit` by hand. The audit is clean now, so a strict gate won't fail today.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add `- run: npm audit --audit-level=high` to the `ci` job, and add `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
```

### 6. Un-ignore `.env.example`

**Impact**: Prevents the env template from silently disappearing from git. The agent relies on it to learn which variables exist.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: append to `.gitignore`:

```
!.env.example
```

### 7. Add `.editorconfig`

**Impact**: Consistent whitespace and EOL for files outside Prettier's reach.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

### 8. Version the database schema as migrations from the first table

**Impact**: If the schema lives only in the Supabase dashboard, the agent can't see it or change it safely.
**Severity**: low
**Effort**: quick (< 5 min per table)
**Fix**: for every schema change, run `npx supabase migration new <name>`, write the SQL in the generated file, and apply it with `npx supabase db reset` locally. Commit `supabase/migrations/`.

### Addressed in upcoming lessons (Category B)

You're ahead of the course here. All three usual Category B items already exist:

### Agent instruction files — present

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: `CLAUDE.md` exists with `AGENTS.md` symlinked to it. Once Vitest lands, add the `npm test` command to it, and consider `/10x-rule-review CLAUDE.md` for a scorecard.

### CI/CD pipeline and deployment — present

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: GitHub Actions (lint, type-check, build, smoke) plus a Vercel deployment (`.vercel/`, `context/foundation/infrastructure.md`) already exist. The only follow-ups are the test and security steps above.

## Summary

Health status: critical-issues

This status now comes from **one** gap alone, the missing unit test runner. By the audit rubric, a missing test runner is enough on its own to mark a project critical-issues. Everything else is in good shape: the dependency audit is clean (the three HIGH advisories were patched with a scoped override), the lockfile is pinned, Node versions are consistent, TypeScript is strict, lint, `astro check` and the build all pass, CI covers lint, type-check, build and an end-to-end auth smoke test, and the agent instruction files and deployment are already in place.

Next step: set up Vitest (fix 1) before implementing the reason-matching business rule. With a working test runner, the project meets every criterion for **healthy**. Fixes 2–8 are quick hygiene you can do in one sitting.
