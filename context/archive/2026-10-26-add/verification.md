# Add Sentry — verification

Date: 2026-10-26 (Europe/Warsaw). Base: `273fc74`. Changes remain uncommitted.

## Result

The implementation and automated verification are complete. The change remains
`implementing` because the plan's three human acceptance checks are not confirmed.
No account, hosted environment, source-map upload or email alert has been marked verified.

## Automated gates

All final commands used Node 24.21.0 from the repository's pinned fnm installation.

| Gate                                           | Result                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `npx astro sync`                               | Passed                                                                   |
| `npm run lint`                                 | Passed                                                                   |
| `npx astro check`                              | Passed: 112 files, 0 errors/warnings/hints                               |
| `npm run build`                                | Passed: Vercel serverless output                                         |
| `npm test`                                     | Passed: 217 tests in 19 files                                            |
| `BASE_URL=http://127.0.0.1:4321 npm run smoke` | All steps passed against local Supabase                                  |
| `npm run check:sentry-build`                   | Passed: 14 public files, no public `.map` or configured build credential |
| `git diff --check`                             | Passed                                                                   |

The smoke walk covered signup/signin/signout, protected routes, two-account
isolation, investment entry, confrontation, price updates, wallet totals and
recoverable deletion. It used the existing local Docker Supabase stack. The Astro
server started for the smoke was stopped afterwards; Supabase was left running.

The first verification attempt found ESM namespace-spy and lint/type issues in
new tests; these were corrected. A first probe POST was rejected by Astro's
origin protection; the harness now supplies the correct Origin without changing
the application's protection. A stale dev-server record initially caused
ECONNREFUSED in smoke; the final smoke used a newly started local server.

## Local SDK delivery

Final run: `node scripts/sentry-probe.mjs` (local loopback permission required).

Retained isolated copy and evidence:
`/var/folders/2n/qsxhjgcs3ygd3mbjx48w0dph0000gn/T/diary-sentry-OPGQaI/`

| Probe                                                | Response                             | Received events               |
| ---------------------------------------------------- | ------------------------------------ | ----------------------------- |
| Native caught read: deleted positions                | 200, existing fallback               | 1                             |
| Native unexpected delete write                       | 302, existing error redirect         | 1                             |
| Native signin with mocked upstream 503               | 302, existing error redirect         | 1; safe status `503` retained |
| Uncaught server exception in isolated control route  | 500                                  | 1                             |
| Automatic browser exception in isolated control page | Page renders                         | 1                             |
| Telemetry receiver returns 503                       | Existing delete response remains 302 | Not required to deliver       |

The receiver accepted real SDK envelopes from Node and Chromium. All final event
payloads excluded the private sentinels, request/user/breadcrumb/extra data and
preserved release/environment and diagnostic frames. Handled operations retained
safe route patterns and distinct request IDs. Only error-event envelope items
were observed: no sessions, transactions, logs or Replay payloads.

`events.json`, `results.json` and `astro.log` are in the retained directory.
The harness copies source without environment files, injects local-only service
fixtures and cleans up its own app/browser/receiver. Probe routes are never
added to the main working tree. Astro dev evidence does not establish Vercel
serverless delivery or production alerting.

## Regression strength

Controlled deliberate breaks were restored unconditionally after checking that
the focused tests failed. They covered removing read reports; auth-classifier
branches; write reporting, validation/conflict/not-found outcomes; middleware
reporting and isolation tags; the final privacy filter; reporter capture; and
the DSN enablement gate. No deliberately broken version remains in source.

## Implementation adaptations

- `tracesSampleRate` is omitted rather than set to zero: the installed SDK treats
  a configured zero rate as enabling tracing instrumentation. BrowserTracing is
  explicitly excluded as well.
- The filter retains safe source-map debug IDs and matching normalized source
  filenames, including compiled server chunks; local account paths and URL
  parameters are removed.
- Safe HTTP/network status and known provider codes survive bounded cause
  traversal. Private provider messages do not.
- Automatic uncaught reports may omit the inner middleware's custom request ID;
  caught-operation reports retain it. Both paths use the final privacy filter.

## Manual checks still pending

1. Plan 1.3: human review of a sample final event.
2. Plan 2.3: human review of local form/fallback behavior.
3. Plan 3.3: create/configure the Sentry project and Vercel variables, verify cold
   API and browser delivery, readable source maps, and a real alert email.

Follow `docs/sentry.md`. Source maps were not uploaded locally because no real
build credentials were supplied. There were no commits, pushes or deployments.
