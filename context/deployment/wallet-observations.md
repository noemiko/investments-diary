# Daily wallet observations (FR-013)

Snapshots record diary values using manually entered quotes, not market closes or cash balances. Capture runs at midnight UTC (01:00/02:00 Warsaw). Missed days stay gaps. Existing wallets wait for the first capture; no backfill occurs. Changes later in a day affect the next capture; old rows remain unchanged.

## Activation and operations

Scheduling is infrastructure as code. Apply the normal Supabase migration chain:

- `20261028160000_wallet_snapshots.sql` installs storage and the restricted capture function.
- `20261028170000_register_daily_wallet_snapshot_job.sql` installs/enables `pg_cron`, validates UTC/GMT, and registers the daily job. **Applying this migration activates the schedule**, including when applied to production through the authorised migration deployment process.

For local development:

```sh
npx supabase migration up --local
```

No Vercel cron, HTTP endpoint or additional secret is required. The named registration updates an existing manually configured job instead of adding a duplicate. Cron infrastructure runs in the configured cron database (`postgres` on Supabase); the migration fails clearly if the timezone is not UTC/GMT.

`npm run configure:wallet-cron` remains a local repair helper and reads the same migration SQL. `npm run test:wallet-cron` verifies the real migration twice inside a rolled-back local transaction. Disposable-database domain tests exclude this infrastructure migration because pg_cron cannot install in a second database; the separate cron test verifies it in its configured database.

Ordinary authenticated and anonymous roles cannot execute capture or write snapshots. Production activation occurs when you apply the migration; it has not been performed by local verification.

Check configuration, last run, and missing observations:

```sql
select jobid, jobname, schedule, command, active from cron.job where jobname='wallet-daily-observations';
select d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='wallet-daily-observations' order by d.start_time desc limit 10;
select w.id, max(s.observation_day) as last_day
from public.wallets w left join public.wallet_snapshots s on s.wallet_id=w.id
where w.deleted_at is null group by w.id
having max(s.observation_day) is null or max(s.observation_day)<(now() at time zone 'UTC')::date;
```

The UI reports the actual last capture time and no observation today when appropriate. A missing day must not be recreated from today's values. On failure inspect job history; fix forward. To pause, disable only this job (never uninstall pg_cron, which could affect other jobs):

```sql
select cron.alter_job(jobid, active := false) from cron.job where jobname='wallet-daily-observations';
```

Preserve existing snapshot rows on rollback. No automated alerting or hosted activation is claimed by local verification.

## Local demo

Set `DEMO_USER_PASSWORD` (at least12 characters) in your shell, then run `npm run seed:demo`. Sign in at the local app using `wallet-demo@example.test` and that password. Passwords and Supabase keys are never printed. An existing account must have this seed's app-metadata marker; unmarked collisions are refused. Reruns do not change the existing account password.

The five `Demo · …` wallets are Rising, Falling, Mixed, Flat and Empty;100 synthetic investments occupy the first four. Their synthetic history has roughly one year of daily observations with gaps. The first seed anchors dates so reruns don't fabricate new days. Missing fixtures are repaired; existing manual edits are preserved. `npm run seed:demo -- --reset` restores the original recognised fixture data. It refuses unrelated positions referencing fixture wallets/categories before changing anything. All work is local; never use `supabase db reset` for demo setup.

Verify with `npm run test:snapshots-db` and `node --test scripts/demo/__tests__/demo-data.test.mjs`. The former uses a disposable database; the latter creates and cleans a marked disposable account.
