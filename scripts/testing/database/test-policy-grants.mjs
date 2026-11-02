// Every RLS policy must be backed by an explicit grant, in a disposable local database; never the
// diary database. A fresh database has no default privileges, which is stricter than hosted Supabase
// (its `postgres` default ACL gives anon/authenticated no select/insert/update/delete). The local stack's
// permissive defaults hid three missing grants until production returned 42501 on 2026-11-02, so this
// replays the whole chain without defaults or fixture grants and checks the chain alone grants access.
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const container = "supabase_db_investments-diary";
const database = `policy_grants_${randomBytes(6).toString("hex")}`;
const run = (args, input) =>
  execFileSync("docker", ["exec", "-i", container, ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (input) => run(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"], input).trim();
const directory = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(directory)
  // pg_cron only installs in its configured database; test its migration separately with test:wallet-cron.
  .filter((name) => name.endsWith(".sql") && name !== "20261028170000_register_daily_wallet_snapshot_job.sql")
  .sort();
const migration = (name) => readFileSync(new URL(name, directory), "utf8");

let created = false;
try {
  run(["createdb", "-U", "postgres", database]);
  created = true;
  sql(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth,public to authenticated,anon;
    ${files.map(migration).join("\n")}`);

  // A policy for an operation is useless (42501) unless the role also holds that privilege.
  // Intentionally ungranted: these tables revoke direct UPDATE and are written only through
  // security-definer RPCs (claim/finish/release quote refresh, the retired listing lookups).
  const ungranted = ["UPDATE market_quote_cache", "UPDATE market_listing_lookups"];
  const missing =
    sql(`select coalesce(string_agg(format('%s %s', p.cmd, p.tablename), ', ' order by p.tablename, p.cmd), '')
    from pg_policies p
    where p.schemaname = 'public' and p.roles && array['authenticated', 'public']::name[]
      and format('%s %s', p.cmd, p.tablename) <> all (array[${ungranted.map((u) => `'${u}'`).join(",")}])
      and not case p.cmd
        when 'SELECT' then has_any_column_privilege('authenticated', format('public.%I', p.tablename), 'select')
        when 'INSERT' then has_any_column_privilege('authenticated', format('public.%I', p.tablename), 'insert')
        when 'UPDATE' then has_any_column_privilege('authenticated', format('public.%I', p.tablename), 'update')
        when 'DELETE' then has_table_privilege('authenticated', format('public.%I', p.tablename), 'delete')
        else has_table_privilege('authenticated', format('public.%I', p.tablename), 'select,insert,update,delete')
      end;`);
  if (missing) throw new Error(`RLS policies without a matching grant for authenticated: ${missing}`);

  const views = sql(`select coalesce(string_agg(c.relname, ', '), '') from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and not has_table_privilege('authenticated', c.oid, 'select');`);
  if (views) throw new Error(`views not readable by authenticated: ${views}`);

  const anon = sql(`select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
      and (has_any_column_privilege('anon', c.oid, 'select') or has_any_column_privilege('anon', c.oid, 'insert')
        or has_any_column_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'));`);
  if (anon) throw new Error(`anon has data access on: ${anon}`);

  console.log(
    "PASS policy grants: every authenticated RLS policy is backed by an explicit grant without default privileges, views are readable, anon has no data access",
  );
} finally {
  if (created) run(["dropdb", "-U", "postgres", database]);
}
