-- FR-013 infrastructure: applying this migration activates daily observations.
-- pg_cron is installed in the configured cron database (Supabase: postgres).
-- Named scheduling is idempotent, including installations configured manually before this migration.
create extension if not exists pg_cron;

do $$
begin
  if current_setting('cron.timezone') not in ('GMT', 'UTC') then
    raise exception 'Wallet observations require pg_cron timezone UTC/GMT';
  end if;
end
$$;

select cron.schedule(
  'wallet-daily-observations',
  '0 0 * * *',
  'select public.capture_wallet_snapshots()'
);

do $$
begin
  if (select count(*) from cron.job
      where jobname = 'wallet-daily-observations'
        and schedule = '0 0 * * *'
        and command = 'select public.capture_wallet_snapshots()'
        and database = current_database()
        and active) <> 1 then
    raise exception 'Daily wallet observation schedule verification failed';
  end if;
end
$$;
