// Exercise the operator recovery template only in a disposable local database.
// No hosted connection, provider request or diary-database reset is involved.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const container = "supabase_db_investments-diary";
const database = `market_recovery_${randomBytes(6).toString("hex")}`;
const run = (args, input) =>
  execFileSync("docker", ["exec", "-i", container, ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (input) => run(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"], input).trim();
const check = (condition, message) =>
  `do $$ begin if not (${condition}) then raise exception '${message}'; end if; end $$;`;
const directory = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".sql") && name !== "20261028170000_register_daily_wallet_snapshot_job.sql")
  .sort();
const split = files.indexOf("20261030110418_market_price_persistence.sql");
if (split < 0) throw new Error("Price migration missing");
const migration = (name) => readFileSync(new URL(name, directory), "utf8");
const recovery = readFileSync(
  new URL("../../../context/deployment/automatic-stock-prices-manual-selection.sql", import.meta.url),
  "utf8",
);
const owner = "00000000-0000-4000-8000-000000000001";
const foreign = "00000000-0000-4000-8000-000000000002";
const wallet = "10000000-0000-4000-8000-000000000001";
const foreignWallet = "10000000-0000-4000-8000-000000000002";
const position = (index) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const cache = "30000000-0000-4000-8000-000000000001";
const receipt = "50000000-0000-4000-8000-000000000001";
const viewMetadata = `select jsonb_build_object('oid',c.oid,'acl',c.relacl,'options',c.reloptions,'columns',
  (select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod) order by a.attnum)
   from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))
  from pg_catalog.pg_class c where c.oid='public.position_effective_prices'::regclass`;
const captureMetadata = `select jsonb_build_object('oid',p.oid,'acl',p.proacl,'config',p.proconfig,
  'definer',p.prosecdef,'definition',pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
  where p.oid='public.capture_wallet_snapshots()'::regprocedure`;
const data = [
  ["positions", "id"],
  ["market_quote_cache", "id"],
  ["market_listing_targets", "id"],
  ["market_selection_receipts", "id"],
  ["wallet_snapshots", "wallet_id,observation_day"],
];
let created = false;
try {
  run(["createdb", "-U", "postgres", database]);
  created = true;
  sql(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth,public to authenticated,anon;
    ${files.slice(0, split).map(migration).join("\n")}
    insert into auth.users values('${owner}'),('${foreign}');
    insert into wallets(id,user_id,name,starting_value) values
      ('${wallet}','${owner}','Recovery',1000),('${foreignWallet}','${foreign}','Foreign',0);
    insert into reason_categories(id,user_id,name) values
      ('${wallet}','${owner}','Reason'),('${foreignWallet}','${foreign}','Foreign reason');
    insert into positions(id,user_id,wallet_id,category_id,instrument,buy_date,buy_price,quantity,current_price,price_date,sell_price,sell_date) values
      ('${position(1)}','${owner}','${wallet}','${wallet}','Manual and automatic','2026-01-01',10,2,12.12345678,'2026-01-02',null,null),
      ('${position(2)}','${owner}','${wallet}','${wallet}','Zero sale','2026-01-01',10,2,15,'2026-01-02',0,'2026-01-03'),
      ('${position(3)}','${owner}','${wallet}','${wallet}','Automatic only','2026-01-01',10,2,null,null,null,null),
      ('${position(4)}','${owner}','${wallet}','${wallet}','Manual only','2026-01-01',10,1,13,'2026-01-03',null,null),
      ('${position(6)}','${foreign}','${foreignWallet}','${foreignWallet}','Foreign','2026-01-01',10,1,null,null,null,null);
    ${files.slice(split).map(migration).join("\n")}
    grant select on public.positions,public.wallets,public.reason_categories to authenticated;
    insert into market_quote_cache(id,user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,instrument_type,
      price,market_at,market_date,fetched_at,market_state,refresh_outcome)
      values('${cache}','${owner}','yahoo','AAPL','NMS','USD','America/New_York','Apple','Nasdaq','EQUITY',
        20.12345678,'2026-01-05T20:00:00Z','2026-01-05','2026-01-05T20:01:00Z','CLOSED','success');
    update positions set market_listing_id='${cache}' where id in ('${position(1)}','${position(2)}','${position(3)}');
    -- The required-selection migration already gave every holding the owner's Apple target; reuse it.
    update market_listing_targets set cache_id='${cache}' where user_id='${owner}' and symbol='AAPL';
    insert into market_selection_receipts(id,user_id,wallet_id,target_id)
      select '${receipt}','${owner}','${wallet}',id from market_listing_targets where user_id='${owner}' and symbol='AAPL';
    insert into positions(id,user_id,wallet_id,category_id,instrument,buy_date,buy_price,quantity,current_price,price_date,market_selection_receipt_id)
      values('${position(5)}','${owner}','${wallet}','${wallet}','Untrusted label','2026-01-01',10,1,16,'2026-01-04','${receipt}');
    ${check(`(select selected_source='automatic' and selected_price=20.12345678 from position_effective_prices where id='${position(1)}')`, "automatic fixture not selected")}
    select public.capture_wallet_snapshots();
    update wallet_snapshots set observation_day=observation_day-1,captured_at=captured_at-interval '1 day';
    ${check(`exists(select 1 from wallet_snapshots where wallet_id='${wallet}' and value=1029.49382712 and automatic_count=2 and manual_count=2)`, "normal capture fixture wrong")}
  `);
  const normalDefinition = sql("select pg_get_viewdef('public.position_effective_prices'::regclass,true)");
  const beforeView = sql(viewMetadata),
    beforeCapture = sql(captureMetadata);
  const beforeData = data.map(([table, order]) =>
    sql(`select coalesce(jsonb_agg(to_jsonb(x) order by ${order}),'[]'::jsonb) from public.${table} x`),
  );
  sql(recovery);
  assert.equal(sql(viewMetadata), beforeView, "recovery changed view columns, security, identity or grants");
  assert.equal(sql(captureMetadata), beforeCapture, "recovery changed capture signature/body/permissions");
  for (const [index, [table, order]] of data.entries())
    assert.equal(
      sql(`select coalesce(jsonb_agg(to_jsonb(x) order by ${order}),'[]'::jsonb) from public.${table} x`),
      beforeData[index],
      `${table} changed during recovery`,
    );
  sql(`${check(`(select selected_price=12.12345678 and selected_source='manual' and selected_at is null from position_effective_prices where id='${position(1)}')`, "manual recovery ignored saved manual value or invented time")}
    ${check(`(select selected_price=0 and selected_source='sale' from position_effective_prices where id='${position(2)}')`, "zero sale lost during recovery")}
    ${check(`(select selected_price is null and selected_source='missing' from position_effective_prices where id='${position(3)}')`, "automatic-only quote still selected")}
    ${check(`(select selected_price=16 and selected_source='manual' from position_effective_prices where id='${position(5)}')`, "pending selection lost manual fallback")}
    ${check("not has_function_privilege('authenticated','public.capture_wallet_snapshots()','execute') and not has_function_privilege('anon','public.capture_wallet_snapshots()','execute') and has_function_privilege('service_role','public.capture_wallet_snapshots()','execute')", "capture permissions changed")}
    set role authenticated; set request.jwt.claim.sub='${owner}';
    ${check("(select count(*)=5 from public.position_effective_prices)", "recovery view lost owner isolation")}
    reset role;
    set role service_role; select public.capture_wallet_snapshots(); reset role;
    ${check(
      `exists(select 1 from wallet_snapshots where wallet_id='${wallet}' and observation_day=(now() at time zone 'UTC')::date
      and value=993.24691356 and automatic_count=0 and manual_count=3 and realised_count=1 and open_count=3 and not_counted=1
      and oldest_market_at is null and as_of='2026-01-02')`,
      "manual app and capture values diverged",
    )}
    ${check(`exists(select 1 from wallet_snapshots where wallet_id='${wallet}' and value=1029.49382712 and automatic_count=2 and manual_count=2)`, "recovery rewrote past observation")}
  `);
  const manualSnapshots = sql(
    "select jsonb_agg(to_jsonb(s) order by wallet_id,observation_day) from wallet_snapshots s",
  );
  // Model a later reviewed additive migration restoring the recorded compatible definition.
  sql(`create or replace view public.position_effective_prices with(security_invoker=true) as ${normalDefinition}`);
  assert.equal(sql(viewMetadata), beforeView, "re-enable changed public view contract");
  assert.equal(sql(captureMetadata), beforeCapture, "re-enable changed capture contract");
  sql(
    check(
      `(select selected_price=20.12345678 and selected_source='automatic' from position_effective_prices where id='${position(1)}')`,
      "normal selection not restored",
    ),
  );
  assert.equal(
    sql("select jsonb_agg(to_jsonb(s) order by wallet_id,observation_day) from wallet_snapshots s"),
    manualSnapshots,
    "re-enable rewrote observations",
  );
  console.log(
    "PASS manual recovery/re-enable: unchanged data/view contract, owner isolation, exact sale/manual selection and future capture parity; capture definition/privileges unchanged (cron verified separately)",
  );
} finally {
  if (created) run(["dropdb", "-U", "postgres", database]);
}
