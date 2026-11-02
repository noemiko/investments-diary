# Verification — wallet performance dashboard

Date: 2026-10-28. Updated: 2026-10-29. All implementation code is present; human manual signoff remains pending in Progress (2.3, 3.2 and 4.3).

- Static sequence: astro sync, lint, astro check (129 files, no errors/warnings/hints), production build — PASS.
- Unit/SSR: 282 tests in24 files — PASS.
- Local database transport:11 tests in2 files, including1002-row signed aggregate pagination and owner isolation — PASS.
- Disposable fresh snapshot database: exact1140 oracle, concurrent capture, first observation retained, write restrictions/RLS, missing days, immutable prior values after delete/restore, baseline edits and close, 16-place arithmetic — PASS.
- Existing close migration compatibility runner — PASS (policy comparison remains limited to the original diary tables, excluding the new snapshot table).
- Demo tests:2 Node tests covering local-only rejection,100-investment/five-wallet fixture totals, creation, preservation, missing snapshot repair, scoped reset, unrelated-reference refusal and unmarked collision — PASS. Disposable users cleaned up.
- Browser:1 Playwright test — PASS; period controls, focus/Enter, tap, reload, noJS table, no browser errors, no mobile document overflow. Desktop/mobile screenshots inspected; mobile chart sizing/date labels corrected before final run.
- HTTP smoke: all steps — PASS against http://127.0.0.1:4321.
- Local pg_cron: named job wallet-daily-observations registered at0 0 * * *, UTC/GMT checked; active singleton registration verified.

Production migration, scheduler activation and deployment were not performed. No prior real history was backfilled. The persistent demo account is created on demand with npm run seed:demo and DEMO_USER_PASSWORD; test runs used disposable accounts.

Operational/development guide (consolidated): [wallet observations and cron](../../deployment/deploy-plan.md#wallet-observations-and-cron).

## Scheduler IaC follow-up

At the user's request, schedule registration moved into versioned migration20261028170000_register_daily_wallet_snapshot_job.sql. Applying it activates the named midnight-UTC job. Local migration application and repeated-registration/permission tests passed. Domain migration regression suites passed; pg_cron infrastructure is tested in its configured database in a rolled-back transaction. CI now includes test:wallet-cron. No production migration was applied.

## Manual acceptance status (2026-10-29)

Progress items 2.3, 3.2 and 4.3 are reopened. Automated browser coverage passes for desktop/mobile layout, keyboard/touch interaction, reload and the no-JavaScript table using disposable fixture accounts. Follow-up coverage also passes for dense flat history and chart sizing across empty ranges. This evidence does not constitute human acceptance of all five seeded demo scenarios.

Pending human checks:

- 2.3: inspect desktop/mobile readability, keyboard and touch details, and the no-JavaScript fallback.
- 3.2: sign into the seeded demo account and inspect all five scenarios and their history.
- 4.3: inspect the seeded desktop/mobile dashboard for clear live/history, stale-price and missing-data distinctions; confirm the documented daily-job and last-successful-run procedure. The operational queries are documented, but human acceptance is not recorded.

Mark these items complete only after recording the inspection date, scenarios and outcome here. Automated test results above remain valid; reopening manual checks does not undo their results. The review rerun of the HTTP smoke check was interrupted and is not claimed as a new pass.
