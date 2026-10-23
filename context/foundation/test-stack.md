# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.1
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npx playwright test
- base URL: http://127.0.0.1:4321
- port: 4321 (detected from Astro framework default; detected default 4321, override with E2E_PORT)
- web server command: npm run build && npm run dev -- --host 127.0.0.1 --port $E2E_PORT; reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects auth-gate-redirect: anonymous dashboard visitors reach the sign-in form
- browser CLI: playwright-cli 0.1.22, command skill at .agents/skills/playwright-cli/SKILL.md
- updated: 2026-10-23

The Vercel adapter rejects `astro preview`, so E2E builds the application and
then serves it through Astro dev. This does not prove deployment runtime parity.
`ASTRO_DEV_BACKGROUND=1` keeps that server in the foreground under Playwright.
Use Node 24 (package engines). Start Docker Desktop and the local Supabase stack
before running; create a dedicated local test user if configuring another machine.
Never use a hosted backend or commit the env file or saved session.
The seed was selected by the user; the current test plan contains no browser-level
risks. Its integration risks remain outside this seed. Sign-in currently lands on
`/`, without returning to the originally requested protected page.
Cold-server verification: auth setup and seed passed (2 tests), 2026-10-23.
