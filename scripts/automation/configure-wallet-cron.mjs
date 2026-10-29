// Local repair/reapplication helper; the versioned migration is the source of truth.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const sql = readFileSync(
  new URL("../../supabase/migrations/20261028170000_register_daily_wallet_snapshot_job.sql", import.meta.url),
  "utf8",
);
execFileSync(
  "docker",
  ["exec", "-i", "supabase_db_investments-diary", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  { input: sql, stdio: ["pipe", "inherit", "inherit"] },
);
