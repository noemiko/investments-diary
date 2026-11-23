# Dependency remediation verification

Verified: 2026-11-23. Runtime: Node 24.21.0, npm 11.19.0.

## Outcome

Application audit: 0 CRITICAL, 0 HIGH, 23 MODERATE (baseline: 0 CRITICAL, 10 HIGH, 23 MODERATE). Reviewer audit: zero findings. Counts represent affected package entries, including propagated findings, not unique exploitable vulnerabilities.

Direct dependency declarations and existing overrides are unchanged. Named transitive updates also refreshed their required dependency and platform-binary chains. No application, schema or hosted-service changes.

## Resolved baseline HIGH entries

| Package | Resolution |
| --- | --- |
| @vercel/functions | 3.11.3 |
| @vercel/oidc | 4.0.9 |
| @vercel/cli-config | 0.4.0 |
| nested zod | vulnerable 4.1.11 removed; uses deduplicated 4.6.7 |
| brace-expansion | 1.1.22 and 5.0.13 |
| devalue | 5.9.4 |
| sharp | 0.35.5 |
| source-map-js | 1.2.4 |
| undici | 8.13.1; vulnerable nested copy removed |
| vite | 8.3.8 |

The resolver selected newer compatible versions than some planning candidates. `npm ls` confirmed valid installed dependency paths; no forced overrides or direct dependency additions were necessary.

## Commands and results

All commands ran under `fnm exec --using=24.21.0`.

| Command/check | Result |
| --- | --- |
| `npm update @vercel/functions brace-expansion devalue sharp source-map-js undici vite` | PASS |
| `npm ci --fetch-retries=0 --fetch-timeout=20000` | PASS: clean install, 940 packages |
| `npm audit --audit-level=high --registry=https://registry.npmjs.org` | PASS, exit 0 |
| `npm audit --prefix scripts/review --audit-level=high --registry=https://registry.npmjs.org` | PASS, exit 0 |
| `npx astro sync` | PASS |
| `npm run lint` | PASS |
| `npx astro check` | PASS: 184 files, 0 errors/warnings/hints |
| `npm run build` | PASS: Vercel server bundle generated locally |
| `npm test` | PASS: 548 tests, 40 files |
| `node --test scripts/review/review.test.mjs` | PASS: 9 tests |
| `npm run check:sentry-build` | PASS: 24 public files, no public source maps or configured build credential |
| `BASE_URL=http://localhost:4321 npm run smoke` | PASS: all HTTP smoke steps |
| `git diff --check` | PASS |
| CI step inspection | PASS: both blocking audits follow their corresponding installations |

The static sequence ran sync → lint → Astro check → build. Local smoke verified auth redirects, cookie/session refresh, sign-out, closed public signup, investment/wallet operations and cross-account isolation. Docker was started, the existing local Supabase stack was discovered at loopback, and the local app/backend URLs were checked before execution. The app server started for verification was stopped afterwards. Existing database services/data were preserved; the existing smoke script creates local fixture accounts and diary records.

No application tests were added or changed, so a deliberate-break test was not applicable. CI configuration was inspected locally; no remote Actions run, PR, commit or deployment was performed.

## Remaining findings and limitations

23 MODERATE affected entries remain, outside the agreed scope: @eslint/config-array, @hono/node-server, @sentry/astro, @sentry/bundler-plugins, @sentry/node, @stryker-mutator/core, @stryker-mutator/vitest-runner, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/type-utils, @typescript-eslint/typescript-estree, @typescript-eslint/utils, @vercel/nft, astro, eslint, fast-uri, glob, hono, minimatch, qs, smol-toml, typed-rest-client, typescript-eslint.

The install reported existing npm install-script approval warnings for the private toolkit, esbuild and fsevents. The required build and regression checks passed without changing install-script policy. Audit results are a point-in-time check; registry/network errors intentionally fail the new CI steps. Browser and dedicated database suites were not rerun; they are not additional acceptance criteria for this dependency-only change.
