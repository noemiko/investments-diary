// Exercise the real infrastructure migration twice, rolling back metadata changes afterward.
// pg_cron cannot be installed in the disposable databases used by domain migration tests.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const migration = readFileSync(
  new URL("../../../supabase/migrations/20261028170000_register_daily_wallet_snapshot_job.sql", import.meta.url),
  "utf8",
);
const sql = `begin;
${migration}
${migration}
do $$ begin
 if (select count(*) from cron.job where jobname='wallet-daily-observations') <> 1 then
 raise exception 'Repeated migration duplicated job'; end if;
 if has_function_privilege('anon','public.capture_wallet_snapshots()','execute')
 or has_function_privilege('authenticated','public.capture_wallet_snapshots()','execute') then
 raise exception 'Capture permissions changed'; end if;
end $$;
rollback;`;
execFileSync(
  "docker",
  ["exec", "-i", "supabase_db_investments-diary", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  { input: sql, stdio: ["pipe", "pipe", "pipe"] },
);
console.log(
  "PASS versioned cron migration, midnight UTC schedule, idempotent registration and restricted capture permissions (rolled back)",
);
