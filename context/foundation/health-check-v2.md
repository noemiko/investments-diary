---
project: investments-diary
checked_at: 2026-11-23T09:49:58+00:00
health_status: needs-attention
context_type: brownfield
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
  high: 10
  moderate: 23
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 8
---

# Health Check — Investments Diary

Audit date: 23 November 2026. This assesses an existing codebase; the PRD retains its original greenfield classification. The prior report is preserved. Analysis only: no dependencies, application code, credentials, or infrastructure were changed.

## Dependency Health

### Lockfile

Status: present (`package-lock.json` and `scripts/review/package-lock.json`).
Package manager: npm. Initial shell: Node 26.7.0 / npm 12.0.2; repository requires Node 24.x and pins 24.21.0 in `.nvmrc`. Node 24.21.0 is installed and was used to confirm the unit suite.

### Security Audit

Tool: `npm audit --json` (exit 1, findings present). A bounded retry against `https://registry.npmjs.org` returned the same result.
Summary: 0 CRITICAL, 10 HIGH, 23 MODERATE, 0 LOW.
Direct vs transitive: 6 direct affected packages and 27 transitive affected packages. All HIGH findings are transitive. Counts represent affected package entries, including propagated findings, rather than independent vulnerabilities or proven exploitable application paths.

The independent reviewer package audit returned zero findings (exit 0). Runtime reachability and production exposure were not established by this dependency audit.

#### CRITICAL findings

None.

#### HIGH findings

- **@vercel/cli-config 0.3.0** — propagated through `zod`. Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **@vercel/functions 3.9.9** — propagated through `@vercel/oidc`. Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **@vercel/oidc 3.8.9** — propagated through `@vercel/cli-config`. Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **brace-expansion 1.1.18, 5.0.9** — [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) (affected: `<1.1.21`); [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) (affected: `>=4.0.0 <5.0.12`); [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) (affected: `<1.1.20`); [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) (affected: `>=4.0.0 <5.0.11`); [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) (affected: `<1.1.19`); [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) (affected: `>=4.0.0 <5.0.10`). Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **devalue 5.9.2** — [devalue: `stringify`/`uneval` serialize shared memory](https://github.com/advisories/GHSA-j22f-vq7h-c4qm) (affected: `>=5.1.0 <=5.9.2`); [devalue: Residual sparse-array CPU amplification in uneval](https://github.com/advisories/GHSA-hx4r-w6wj-j8fg) (affected: `<=5.9.2`); [devalue: Repeated primitive strings cause quadratic expansion in uneval](https://github.com/advisories/GHSA-mcm9-63f2-9j32) (affected: `<=5.9.2`); [devalue: Sparse arrays emitted by uneval cause eager allocation when evaluated](https://github.com/advisories/GHSA-wf3x-273g-mvxv) (affected: `>=1.0.0 <=5.9.2`); [devalue: stringifyAsync can cause an unhandled rejection despite a caught returned promise](https://github.com/advisories/GHSA-x5rw-q4pp-hg5g) (affected: `>=5.8.0 <=5.9.2`); [devalue: Malformed null-prototype object keys bypass __proto__ rejection via property-key coercion](https://github.com/advisories/GHSA-4q55-j62x-fr9h) (affected: `<=5.9.2`); [devalue: Custom ArrayBuffer revivers can bypass typed-array allocation validation](https://github.com/advisories/GHSA-r9w8-h9r3-54w4) (affected: `<=5.9.2`). Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **sharp 0.35.4** — [sharp : Vulnerability in librsvg dependency CVE-2026-96889](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) (affected: `<0.35.5`). Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **source-map-js 1.2.1** — [source-map-js allows event-loop denial of service through indexed source-map section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (affected: `>=1.0.0 <1.2.2`). Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **undici 8.10.2** — [undici vulnerable to Denial of Service via unbounded memory in the EventSource parser](https://github.com/advisories/GHSA-4qv8-2p9j-2685) (affected: `>=8.0.0 <8.12.2`); [undici vulnerable to Subresource Integrity bypass via non-lowercase algorithm tokens](https://github.com/advisories/GHSA-f72v-6w45-q472) (affected: `>=8.0.0 <8.12.2`); [undici vulnerable to Denial of Service via unhandled error on excessive content-encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c) (affected: `>=8.0.0 <8.12.2`); [undici vulnerable to cache poisoning and cross-user disclosure via cross-origin redirects](https://github.com/advisories/GHSA-4w7w-5xrc-9h26) (affected: `>=8.0.0 <8.12.2`); [undici vulnerable to TLS certificate validation bypass via dropped tls options in Agent](https://github.com/advisories/GHSA-2m5v-pch6-74hx) (affected: `>=8.0.0 <8.12.2`); [undici vulnerable to Denial of Service via TLS 1.2 certificate-changing renegotiation](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) (affected: `>=8.0.0 <8.12.2`); [undici WebSocket client vulnerable to Denial of Service via unbounded automatic PONG buffering](https://github.com/advisories/GHSA-9fm3-97px-rjf6) (affected: `>=8.0.0 <8.12.2`); [undici vulnerable to Denial of Service via unhandled exception in the decompress interceptor](https://github.com/advisories/GHSA-55wc-3pg8-jfw6) (affected: `>=8.0.0 <8.12.2`). Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **vite 8.3.0** — [launch-editor: escapeCmdArgs() omits % escaping on Windows](https://github.com/advisories/GHSA-698v-4r3x-3vcv) (affected: `>=8.3.0 <=8.3.2`); [launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors](https://github.com/advisories/GHSA-r825-w8mm-5pxw) (affected: `>=8.3.0 <=8.3.2`); [launch-editor: `fs.existsSync()` existence check can be bypassed on Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm) (affected: `>=8.3.0 <=8.3.2`); [Vite: Cross origin script execution through Vite custom middleware](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) (affected: `>=8.3.0 <=8.3.2`); [Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) (affected: `>=8.3.0 <=8.3.2`); [Vite: First 4 bytes of files outside of `server.fs` setting is exposed by `?vite-wasm-instance`](https://github.com/advisories/GHSA-vfpm-58rq-9qcg) (affected: `>=8.3.0 <=8.3.2`). Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

- **zod 4.1.11** — [Zod can exhaust memory while validating oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (affected: `<4.6.6`). Fix: Update the owning dependency and re-audit; npm reports a fix available, without an exact target.

MODERATE findings (23 affected package entries):

- **@eslint/config-array** — minimatch.
- **@hono/node-server** — @hono/node-server: Unhandled `ECONNRESET` on the socket during an asynchronous WebSocket upgrade crashes the process, @hono/node-server: Backslash in the request path is parsed as a path separator, bypassing path-based access control at a reverse proxy.
- **@sentry/astro** — @sentry/bundler-plugins, @sentry/node.
- **@sentry/bundler-plugins** — glob.
- **@sentry/node** — @sentry/bundler-plugins.
- **@stryker-mutator/core** — minimatch.
- **@stryker-mutator/vitest-runner** — @stryker-mutator/core.
- **@typescript-eslint/eslint-plugin** — @typescript-eslint/type-utils, @typescript-eslint/utils.
- **@typescript-eslint/parser** — @typescript-eslint/typescript-estree.
- **@typescript-eslint/type-utils** — @typescript-eslint/typescript-estree, @typescript-eslint/utils.
- **@typescript-eslint/typescript-estree** — minimatch.
- **@typescript-eslint/utils** — @typescript-eslint/typescript-estree.
- **@vercel/nft** — glob.
- **astro** — Astro: Arbitrary CSS injection in Astro View Transitions, Astro: XSS via attribute injection in dynamic tag names, Astro: Image endpoint in @astrojs/node can read files from a case-variant sibling of the output directory on case-sensitive filesystems.
- **eslint** — minimatch.
- **fast-uri** — fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets, fast-uri vulnerable to URI scheme spoofing via percent-encoded scheme decoding, fast-uri vulnerable to improper path equivalence in relative reference normalization, fast-uri vulnerable to host confusion via unchecked WHATWG host canonicalization, fast-uri vulnerable to scheme injection via an unescaped first-segment colon in suffix references.
- **glob** — Glob: AbortSignal cancellation bypass allows post-timeout filesystem traversal, minimatch.
- **hono** — Hono: `mount()` and `app.mount()` can forward a path that bypasses middleware scoped inside the mount prefix, Hono: RegExpRouter skips wildcard middleware for some route sets and for paths with an encoded line terminator, Hono: `css` helper does not escape a closing tag split between the template and an interpolated value, allowing HTML injection, Hono: `csrf()` does not check requests sent by hyperlink auditing (`text/ping`), Hono: `validator('form')` skips validation for `multipart/form-data` requests with extra parameters.
- **minimatch** — minimatch has potential denial of service via globparts amplification.
- **qs** — qs has a remotely triggerable DoS: qs.stringify crashes with TypeError on null/undefined entries in comma-format arrays when encodeValuesOnly is set, qs array-limit bypass via bracket-key comma parsing, qs: Denial of Service via Attacker Controlled isBuffer, qs : qs.stringify with arrayFormat 'comma' throws an uncaught TypeError on array elements carrying a non-callable own toString (DoS).
- **smol-toml** — smol-toml: Quadratic-time parse() from parseKey rescanning to end of document on each key line.
- **typed-rest-client** — qs.
- **typescript-eslint** — @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/typescript-estree, @typescript-eslint/utils.

LOW findings: none at package severity level; some advisories inside higher-severity package entries have lower severity.

### Outdated Dependencies

Packages with major version gaps: 4 public direct dependencies; none more than one major behind.

| Package | Installed | Latest | Major gap |
| --- | --- | --- | --- |
| @astrojs/react | 6.0.5 | 7.1.9 | 1 |
| lint-staged | 16.4.0 | 17.6.2 | 1 |
| supabase | 2.117.0 | 3.2.0 | 1 |
| typescript | 6.0.3 | 7.0.2 | 1 |

Initial `npm outdated --json` failed with E401 at the private GitHub package registry. Retrying with explicit public dependency names succeeded (exit 1 means updates exist); private toolkit freshness remains unknown. No token values were inspected. In-range Astro 7.4.13 and Vercel adapter 11.0.22 are available. Sentry is exactly pinned at 11.8.0; npm suggests 11.16.0 for affected chains. Do not upgrade Supabase to v3 without migrating the `[inbucket]` configuration, as CI already documents.

## Test Suite

Test runners: Vitest 5.0.5, Playwright 1.64.1, Node built-in test runner.
Tests found: 548 unit tests in 40 files; 9 reviewer tests; 24 Playwright entries in 10 files, including auth setup.
Test execution: Vitest passing on both the initial Node 26 shell and required Node 24.21.0; reviewer tests passing on Node 26. Playwright discovery passing; browser execution not attempted.

Configuration: `vitest.config.ts`, `vitest.database.config.ts`, `playwright.config.ts`, `scripts/review/package.json`.

Commands verified: `npm test`, `fnm exec --using=24.21.0 npm test`, `node --test scripts/review/review.test.mjs`, and local Playwright `test --list`. Database tests and smoke require local Supabase and were not run. No full static verification or production build was attempted during this read-only health assessment; CI configuration is evidence of wiring, not proof of a current green run.

## CI/CD

Provider: GitHub Actions.
Configuration: `.github/workflows/ci.yml`, `pr-review.yml`, `claude.yml`, `ai-toolkit.yml`.

| Stage | Status | Notes |
| --- | --- | --- |
| Lint | ✓ | `npm run lint` after Astro sync |
| Test | ✓ | Vitest and reviewer tests; local database/ownership/cron/recovery checks; decision-history browser project; smoke on master pushes |
| Build | ✓ | `npm run build` with Supabase configuration |
| Type check | ✓ | `npx astro check` |
| Security | ✗ | No dependency audit, Dependabot configuration, or CodeQL found; database ownership checks are present |

CI currently selects only the decision-history Playwright project. Remaining browser scenarios are discoverable locally but are not executed by these workflows. Build precedes browser tests, but tests serve the development server because the Vercel adapter has no preview server; this does not validate the deployed bundle. Workflow execution history, branch protection, and secret availability were not queried.

## Configuration

### High severity

No missing high-severity configuration: `.gitignore` exists, TypeScript inherits `astro/tsconfigs/strict`, and ESLint and Prettier configurations exist.

### Medium severity

- **Local runtime drift** — default execution used Node 26 despite the Node 24 requirement. Use `fnm use` from the repository or `fnm exec --using=24.21.0 <command>`.
- **Private registry authentication** — E401 prevents a complete freshness check and may block clean installation. Restore the configured GitHub Packages authentication securely, then retry `npm outdated --json` and a clean install in a disposable checkout; installation itself was not tested here.

### Low severity

- **`.editorconfig` missing** — add shared UTF-8, LF, two-space indentation and final-newline defaults.
- **`.env.example` ignored by `.env*`** — the template is currently tracked, but replacements/new templates can be ignored. Add `!.env.example` after `.env*`.

Four configuration gaps: zero high, two medium, two low. `AGENTS.md` resolves to the existing `CLAUDE.md`; environment documentation, Vercel configuration, and 20 versioned SQL migrations are present. Whole-repository pre-commit lint is intentional in current instructions; unused lint-staged configuration alone does not justify replacing that guard.

## Stack Assessment Cross-Reference

No `context/foundation/stack-assessment.md` found. Stack rationale exists in `tech-stack.md`; no stack-assessment quality-gate verdict or compensation requirements could be cross-referenced. Run `/10x-stack-assess` if that additional analysis is wanted.

Compared with the September report, the absent test runner and absent migrations are resolved. Strict type and environment rules are documented in the shared agent instructions. The existing scoped `path-to-regexp` override remains; this run did not flag that package.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Update and review affected dependency chains

**Impact**: Ten HIGH transitive entries and moderate framework/tooling findings make unreviewed upgrades and reliance on a clean historical audit unsafe.
**Severity**: high
**Effort**: significant (> 1 hour)
**Fix**: After restoring registry access, update Astro and its Vercel adapter within their current major, refresh affected transitive dependencies, and deliberately revise the Sentry pin to the audit-proposed version. Inspect the lockfile diff and re-run both package audits. Use `npm explain zod`, `npm explain vite`, `npm explain sharp`, and `npm explain devalue` to identify owning chains. Confirm patched versions against the affected ranges above (for example zod >=4.6.6, sharp >=0.35.5, source-map-js >=1.2.2, undici >=8.12.2). npm reports no automatic fix for the Stryker entries; evaluate upstream compatibility and record residual risk. Do not force major upgrades or remove the existing override. Validate with the repository verify sequence and relevant local database/smoke checks after updates.

### 2. Restore private registry authentication

**Impact**: Agents cannot fully inspect freshness, and clean dependency installation may fail even though existing node_modules permits local tests.
**Severity**: medium
**Effort**: moderate (15–30 min)
**Fix**: Renew the credential used by the existing scoped GitHub Packages configuration with package-read access. Keep it out of tracked files and logs. Retry `npm outdated --json`; verify `npm ci` in a disposable checkout with Node 24.

### 3. Use the pinned runtime locally

**Impact**: Node 26 differs from CI and deployment requirements and may hide compatibility problems.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: Run `fnm use` in the repository, confirm `node --version` is 24.21.0, and enable the shell's fnm directory hook if desired. The audit already confirmed all 548 unit tests on Node 24.

### 4. Add automated dependency security checks

**Impact**: The old clean audit became stale without an automated advisory check.
**Severity**: medium
**Effort**: moderate (15–30 min)
**Fix**: Add `npm audit --audit-level=high` and `npm audit --prefix scripts/review --audit-level=high` to CI after remediation, plus `.github/dependabot.yml` entries for `/` and `/scripts/review`. Configure private registry access for the updater securely.

### 5. Expand CI browser coverage deliberately

**Impact**: Existing browser regressions outside decision history can pass CI without being exercised.
**Severity**: medium
**Effort**: significant (> 1 hour)
**Fix**: Add a local-Supabase CI job for `npx playwright test --project=chromium`, including auth fixture prerequisites and report uploads. Review shared-user fixture isolation before enabling parallel tests. Keep the current dev-server limitation explicit; add a deployment smoke check separately if built-runtime assurance is required.

### 6. Plan optional major upgrades separately

**Impact**: Four one-major gaps can tempt agents into incompatible configuration changes.
**Severity**: low
**Effort**: significant (> 1 hour)
**Fix**: Evaluate React integration 7, TypeScript 7, lint-staged 17 and Supabase CLI 3 as separate changes with compatibility review and full project verification. Keep the Supabase CLI and config migration aligned with CI. None is two or more majors behind.

### 7. Preserve environment templates in Git

**Impact**: Re-created templates may silently disappear from future commits.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: Append `!.env.example` after `.env*` in `.gitignore`, and verify `git check-ignore --no-index .env.example` no longer reports it ignored.

### 8. Add editor defaults

**Impact**: Files outside formatter coverage lack shared whitespace defaults.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: Create `.editorconfig` with `root = true` and an `[*]` section specifying `charset = utf-8`, `end_of_line = lf`, `indent_style = space`, `indent_size = 2`, `insert_final_newline = true`, and `trim_trailing_whitespace = true`.

### Addressed in upcoming lessons (Category B)

No missing baseline items: agent instructions, CI and deployment configuration already exist. Agent onboarding ([M1L4](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)) and infrastructure ([M1L5](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)) remain useful reference material; no stub instructions or replacement deployment configuration are recommended.

## Summary

Health status: needs-attention.

The project has reproducible dependency metadata, strict local configuration, working unit tests, agent instructions, migrations and substantial CI coverage. Current dependency advisories, registry authentication and runtime drift need attention; this is a substantial improvement from the historical missing-test-runner verdict. Eight recommendations: three quick, two moderate and three significant.

Next step: review affected dependencies and restore reproducible local tooling, then maintain the existing onboarding instructions. Browser and database execution, the full static verification sequence, deployed behavior and CI run status remain unverified by this report.
