// Required stock selection migration in a disposable local database; never the diary database.
// No hosted connection or provider request is involved: the "download" is the finish RPC
// fed a fixture quote, exactly as the server applies a verified provider result.
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const container = "supabase_db_investments-diary";
const database = `required_selection_${randomBytes(6).toString("hex")}`;
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
const required = "20261102120000_require_position_stock_selection.sql";
const files = readdirSync(directory)
  // pg_cron only installs in its configured database; test its migration separately with test:wallet-cron.
  .filter((name) => name.endsWith(".sql") && name !== "20261028170000_register_daily_wallet_snapshot_job.sql")
  .sort();
const split = files.indexOf(required);
if (split < 0) throw new Error("Required selection migration missing");
const migration = (name) => readFileSync(new URL(name, directory), "utf8");

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const usd = "10000000-0000-4000-8000-000000000001";
const pln = "10000000-0000-4000-8000-000000000002";
const eur = "10000000-0000-4000-8000-000000000003";
const otherWallet = "10000000-0000-4000-8000-000000000004";
const position = (index) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const cdrCache = "30000000-0000-4000-8000-000000000001";
const appleCache = "30000000-0000-4000-8000-000000000002";
const msftTarget = "40000000-0000-4000-8000-000000000001";
const receipt = "50000000-0000-4000-8000-000000000001";
const snapshot = (table, order) =>
  `select coalesce(jsonb_agg(to_jsonb(x) order by ${order}),'[]'::jsonb) from ${table} x`;
const appleTarget = (user) =>
  `(select id from market_listing_targets where user_id='${user}' and (provider,symbol,exchange,instrument_type)=('yahoo','AAPL','NMS','EQUITY'))`;

let created = false;
try {
  run(["createdb", "-U", "postgres", database]);
  created = true;
  sql(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth,public to authenticated,anon;
    ${files.slice(0, split).map(migration).join("\n")}
    grant select,insert on public.positions to authenticated; -- UPDATE comes only from the chain's column grants
    grant select on public.wallets,public.reason_categories to authenticated;
    insert into auth.users values('${owner}'),('${other}');
    insert into wallets(id,user_id,name,starting_value,currency) values
      ('${usd}','${owner}','USD wallet',1000,'USD'),('${pln}','${owner}','PLN wallet',0,'PLN'),
      ('${eur}','${owner}','EUR wallet',0,'EUR'),('${otherWallet}','${other}','Other',0,'USD');
    insert into reason_categories(id,user_id,name) values('${usd}','${owner}','Reason'),('${otherWallet}','${other}','Reason');
    insert into market_quote_cache(id,user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,instrument_type,
      price,market_at,market_date,fetched_at,market_state,refresh_outcome) values
      ('${cdrCache}','${owner}','yahoo','CDR.WA','WSE','PLN','Europe/Warsaw','CD Projekt','Warsaw','EQUITY',
        120.5,'2026-01-05T15:00:00Z','2026-01-05','2026-01-05T15:01:00Z','CLOSED','success');
    insert into positions(id,user_id,wallet_id,category_id,instrument,buy_date,buy_price,quantity,current_price,price_date,sell_price,sell_date,deleted_at) values
      ('${position(1)}','${owner}','${usd}','${usd}','Open draft','2026-01-01',10,2,11,'2026-01-02',null,null,null),
      ('${position(2)}','${owner}','${usd}','${usd}','Closed draft','2026-01-01',10,2,11,'2026-01-02',0,'2026-01-03',null),
      ('${position(3)}','${owner}','${usd}','${usd}','Deleted draft','2026-01-01',10,2,null,null,null,null,'2026-01-04T00:00:00Z'),
      ('${position(4)}','${owner}','${pln}','${usd}','PLN draft','2026-01-01',10,1,12,'2026-01-02',null,null,null),
      ('${position(5)}','${owner}','${eur}','${usd}','EUR draft','2026-01-01',10,1,null,null,null,null,null),
      ('${position(6)}','${owner}','${pln}','${usd}','Linked CDR','2026-01-01',100,1,null,null,null,null,null),
      ('${position(9)}','${owner}','${usd}','${usd}','USD draft without price','2026-01-01',10,3,null,null,null,null,null),
      ('${position(8)}','${other}','${otherWallet}','${otherWallet}','Other account draft','2026-01-01',5,1,null,null,null,null,null);
    update positions set market_listing_id='${cdrCache}' where id='${position(6)}';
    -- A holding created through the selection flow keeps its own selection.
    insert into market_listing_targets(id,user_id,provider,symbol,exchange,listing_name,exchange_name,instrument_type)
      values('${msftTarget}','${owner}','yahoo','MSFT','NMS','Microsoft','NasdaqGS','EQUITY');
    insert into market_selection_receipts(id,user_id,wallet_id,target_id) values('${receipt}','${owner}','${usd}','${msftTarget}');
    insert into positions(id,user_id,wallet_id,category_id,instrument,buy_date,buy_price,market_selection_receipt_id)
      values('${position(7)}','${owner}','${usd}','${usd}','ignored','2026-01-01',10,'${receipt}');
    update positions set current_price=13,price_date='2026-01-03' where id='${position(1)}';
    select public.capture_wallet_snapshots();
    ${check("(select count(*)=8 from positions where market_target_id is null)", "fixture has no unselected holdings")}
  `);
  const tables = [
    ["wallets", "id"],
    ["market_quote_cache", "id"],
    ["market_selection_receipts", "id"],
    ["wallet_snapshots", "wallet_id,observation_day"],
  ];
  const before = tables.map(([table, order]) => sql(snapshot(table, order)));
  const positionsBefore = sql("select jsonb_agg(to_jsonb(p)-'market_target_id' order by id) from positions p");
  const msftBefore = sql(`select to_jsonb(t) from market_listing_targets t where id='${msftTarget}'`);
  sql(migration(required));

  for (const [index, [table, order]] of tables.entries())
    if (sql(snapshot(table, order)) !== before[index]) throw new Error(`${table} changed during migration`);
  if (sql("select jsonb_agg(to_jsonb(p)-'market_target_id' order by id) from positions p") !== positionsBefore)
    throw new Error("migration changed labels, prices, save times, wallets, listings or other position facts");
  if (sql(`select to_jsonb(t) from market_listing_targets t where id='${msftTarget}'`) !== msftBefore)
    throw new Error("existing selection target changed");

  sql(`${check("not exists(select 1 from positions where market_target_id is null)", "a holding has no selection")}
    ${check("(select attnotnull from pg_attribute where attrelid='public.positions'::regclass and attname='market_target_id')", "selection column nullable")}
    ${check("(select tgenabled='O' from pg_trigger where tgrelid='public.positions'::regclass and tgname='positions_guard_selection')", "selection guard not re-enabled")}
    ${check("not exists(select 1 from pg_trigger where tgrelid='public.positions'::regclass and not tgisinternal and tgenabled<>'O')", "another positions trigger left disabled")}
    ${check(`(select count(*)=6 from positions where id in ('${position(1)}','${position(2)}','${position(3)}','${position(4)}','${position(5)}','${position(9)}') and market_target_id=${appleTarget(owner)})`, "open/closed/deleted/PLN/EUR drafts did not get Apple")}
    ${check(`(select market_target_id=${appleTarget(other)} from positions where id='${position(8)}')`, "other account did not get its own Apple target")}
    ${check(`(select t.symbol='CDR.WA' and t.exchange='WSE' and t.instrument_type='EQUITY' and t.cache_id='${cdrCache}' and t.listing_name='CD Projekt' from positions p join market_listing_targets t on t.id=p.market_target_id where p.id='${position(6)}')`, "confirmed listing did not get a matching target")}
    ${check(`(select market_target_id='${msftTarget}' and market_selection_receipt_id='${receipt}' from positions where id='${position(7)}')`, "existing selection replaced")}
    ${check(`(select listing_name='Apple Inc.' and exchange_name='NasdaqGS' and cache_id is null and refresh_outcome='never' from market_listing_targets where id=${appleTarget(owner)})`, "Apple target metadata wrong")}
    ${check("not exists(select 1 from positions p join market_listing_targets t on t.id=p.market_target_id where t.user_id<>p.user_id)", "cross-account selection")}
    ${check("(select count(*)=1 from market_listing_targets where user_id='" + other + "')", "foreign targets created for other account")}
  `);

  // Two layers protect a saved selection: signed-in users hold no UPDATE on the selection columns,
  // and the re-enabled guard rejects a change even from a privileged role. Inserts need a selection.
  sql(`set role authenticated; set request.jwt.claim.sub='${owner}';
    do $$ begin
      begin update positions set market_target_id='${msftTarget}' where id='${position(1)}';
        raise exception 'selection change allowed'; exception when insufficient_privilege then null; end;
      begin update positions set market_selection_receipt_id='${receipt}' where id='${position(1)}';
        raise exception 'receipt change allowed'; exception when insufficient_privilege then null; end;
      begin insert into positions(user_id,wallet_id,category_id,instrument,buy_date,buy_price)
        values(auth.uid(),'${usd}','${usd}','No selection','2026-01-01',10);
        raise exception 'insert without selection allowed'; exception when not_null_violation then null; end;
    end $$;
    reset role;
    do $$ begin
      begin update positions set market_target_id='${msftTarget}' where id='${position(1)}';
        raise exception 'guard disabled: privileged selection change allowed'; exception when check_violation then null; end;
      begin update positions set market_selection_receipt_id='${receipt}' where id='${position(1)}';
        raise exception 'guard disabled: privileged receipt change allowed'; exception when check_violation then null; end;
    end $$;`);

  // First explicit download: USD-wallet Apple holdings are priced, PLN/EUR ones are incompatible.
  sql(`insert into market_quote_cache(id,user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,instrument_type,
      price,market_at,market_date,fetched_at,market_state,refresh_outcome) values
      ('${appleCache}','${owner}','yahoo','AAPL','NMS','USD','America/New_York','Apple Inc.','NasdaqGS','EQUITY',
        200.25,'2026-01-05T21:00:00Z','2026-01-05','2026-01-05T21:01:00Z','CLOSED','success');`);
  const mismatches = sql(`set role authenticated; set request.jwt.claim.sub='${owner}';
    select public.finish_market_target(${appleTarget(owner)},public.claim_market_target(${appleTarget(owner)}),'success','${appleCache}');`);
  if (mismatches !== "2") throw new Error(`expected 2 incompatible_currency holdings, got ${mismatches}`);
  sql(`${check(`(select count(*)=2 from positions where id in ('${position(1)}','${position(9)}') and market_listing_id='${appleCache}')`, "USD Apple holdings not priced")}
    ${check(`(select selected_source='automatic' and selected_price=200.25 from position_effective_prices where id='${position(9)}')`, "download did not select automatic price")}
    ${check(`(select selected_source='manual_override' and selected_price=13 from position_effective_prices where id='${position(1)}')`, "later manual save lost to an older quote")}
    ${check(`not exists(select 1 from positions where id in ('${position(2)}','${position(3)}','${position(4)}','${position(5)}') and market_listing_id is not null)`, "closed/deleted/incompatible holding linked")}
    ${check(`(select instrument='Open draft' from positions where id='${position(1)}')`, "download rewrote label")}
  `);

  // Full chain: later migrations retire existing-position listing lookup/confirm RPCs while the
  // creation-time selection download path stays executable.
  const later = files.slice(split + 1);
  if (!later.includes("20261102130000_retire_listing_lookup_rpcs.sql"))
    throw new Error("Lookup retirement migration missing");
  sql(later.map(migration).join("\n"));
  const retired = [
    "public.claim_listing_lookup(uuid)",
    "public.finish_listing_lookup(uuid,uuid,uuid,timestamptz,boolean)",
    "public.confirm_listing_lookup(uuid,uuid)",
  ];
  const live = [
    "public.claim_market_target(uuid)",
    "public.finish_market_target(uuid,uuid,text,uuid,timestamptz,boolean)",
  ];
  sql(`${retired.map((fn) => check(`not has_function_privilege('authenticated','${fn}','execute')`, `${fn} executable by authenticated`)).join("\n")}
    ${check(`not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon',p.oid,'execute') and p.proname in ('claim_listing_lookup','finish_listing_lookup','confirm_listing_lookup','claim_market_target','finish_market_target'))`, "anon can execute a listing/target RPC")}
    ${live.map((fn) => check(`has_function_privilege('authenticated','${fn}','execute')`, `${fn} not executable by authenticated`)).join("\n")}
    ${["market_listing_id", "listing_confirmed_at"].map((col) => check(`not has_column_privilege('authenticated','public.positions','${col}','update')`, `${col} updatable by authenticated`)).join("\n")}
    ${check(`has_column_privilege('authenticated','public.positions','current_price','update')`, "manual price no longer updatable by authenticated")}
  `);
  console.log(
    "PASS required selection: Apple for open/closed/deleted/PLN/EUR drafts per account, matching targets for confirmed listings, unchanged facts/receipts/cache/observations, guard re-enabled, NOT NULL, USD download priced and PLN/EUR incompatible, listing lookup RPCs and listing-column updates retired, target RPCs executable",
  );
} finally {
  if (created) run(["dropdb", "-U", "postgres", database]);
}
