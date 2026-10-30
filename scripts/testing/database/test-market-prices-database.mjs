// Disposable local database: validates migration/backfill and real competing connections.
// Never resets the diary database or connects to a hosted project.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
const container = "supabase_db_investments-diary";
const database = `market_prices_${randomBytes(6).toString("hex")}`;
const owner = "00000000-0000-4000-8000-000000000001";
const foreign = "00000000-0000-4000-8000-000000000002";
const wallet = "10000000-0000-4000-8000-000000000001";
const position = "20000000-0000-4000-8000-000000000001";
const cache = "30000000-0000-4000-8000-000000000001";
const otherCache = "30000000-0000-4000-8000-000000000002";
const run = (args, input) =>
  execFileSync("docker", ["exec", "-i", container, ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const psqlArgs = ["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (input) => run(psqlArgs, input).trim();
const own = (input, id = owner) => sql(`set role authenticated; set request.jwt.claim.sub='${id}'; ${input}`);
const assertSql = (condition, message) =>
  `do $$ begin if not (${condition}) then raise exception '${message}'; end if; end $$;`;
const directory = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(directory)
  .filter((f) => f.endsWith(".sql") && f !== "20261028170000_register_daily_wallet_snapshot_job.sql")
  .sort();
const first = "20261030110418_market_price_persistence.sql";
const migration = (name) => readFileSync(new URL(name, directory), "utf8");
const split = files.indexOf(first);
if (split < 0) throw new Error("Price persistence migration missing");
const finish = (token, price = "12", at = "'2026-01-01T12:00:00Z'") =>
  `select public.finish_market_quote_refresh('${cache}','${token}','success',${price},${at},(${at}::timestamptz at time zone 'UTC')::date,statement_timestamp(),'REGULAR');`;
function competingClaim() {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, ...psqlArgs], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "",
      err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
    child.stdin.end(
      `set role authenticated; set request.jwt.claim.sub='${owner}'; select public.claim_market_quote_refresh('${cache}');`,
    );
  });
}
let created = false;
try {
  run(["createdb", "-U", "postgres", database]);
  created = true;
  sql(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth,public to authenticated,anon;
    ${files.slice(0, split).map(migration).join("\n")}
    insert into auth.users values('${owner}'),('${foreign}');
    insert into wallets(id,user_id,name,starting_value) values('${wallet}','${owner}','Legacy',1000);
    insert into reason_categories(id,user_id,name) values('${wallet}','${owner}','Reason');
    insert into positions(id,user_id,wallet_id,category_id,instrument,buy_date,buy_price,quantity,current_price,price_date)
      values('${position}','${owner}','${wallet}','${wallet}','Original diary label','2026-01-01',10,2,11,'2026-01-02');
    select public.capture_wallet_snapshots();
    create table fixture_wallets_before as select to_jsonb(w) facts from wallets w;
    create table fixture_positions_before as select to_jsonb(p) facts from positions p;
    create table fixture_snapshots_before as select * from wallet_snapshots;
    ${files.slice(split).map(migration).join("\n")}
    ${assertSql("(select currency is null and not currency_attested and currency_confirmed_at is null from wallets)", "legacy currency guessed")}
    ${assertSql("(select manual_price_saved_at is null and market_listing_id is null from positions)", "legacy save time guessed")}
    ${assertSql("not exists(select 1 from wallets w,fixture_wallets_before b where to_jsonb(w)-'currency'-'currency_attested'-'currency_confirmed_at' <> b.facts)", "legacy wallet facts changed")}
    ${assertSql("not exists(select 1 from positions p,fixture_positions_before b where to_jsonb(p)-'manual_price_saved_at'-'market_listing_id'-'listing_confirmed_at' <> b.facts)", "legacy position facts changed")}
    ${assertSql("not exists((select * from wallet_snapshots except select * from fixture_snapshots_before) union all (select * from fixture_snapshots_before except select * from wallet_snapshots))", "old observations changed")}
    grant all on public.positions,public.wallets,public.reason_categories to authenticated,anon;
    ${assertSql("(select relrowsecurity from pg_class where oid='public.market_quote_cache'::regclass)", "cache RLS disabled")}
    ${assertSql("(select count(*)=3 from pg_policies where tablename='market_quote_cache' and roles=array['authenticated']::name[])", "missing operation policies")}
    insert into market_quote_cache(id,user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,instrument_type)
      values('${cache}','${owner}','yahoo','AAPL','NMS','USD','UTC','Apple','Nasdaq','EQUITY'),
            ('${otherCache}','${foreign}','yahoo','AAPL','NMS','USD','UTC','Apple','Nasdaq','EQUITY');
  `);
  own(`do $$ begin
    begin insert into wallets(user_id,name,starting_value) values(auth.uid(),'Missing currency',0);
      raise exception 'new wallet missing currency allowed'; exception when check_violation then null; end;
    begin update wallets set currency='USD' where id='${wallet}';
      raise exception 'unattested confirmation allowed'; exception when check_violation then null; end;
    begin update positions set market_listing_id='${cache}' where id='${position}';
      raise exception 'unconfirmed wallet linked'; exception when check_violation then null; end;
    end $$;
    update wallets set name='Legacy renamed',starting_value=1000 where id='${wallet}';
    ${assertSql("(select currency is null from wallets)", "ordinary edit guessed currency")}
    update wallets set currency='USD',currency_attested=true where id='${wallet}';
    ${assertSql("(select currency='USD' and currency_confirmed_at is not null from wallets)", "confirmation not saved")}
    do $$ begin
      begin update wallets set currency='EUR' where id='${wallet}'; raise exception 'currency changed'; exception when check_violation then null; end;
      begin update wallets set currency=null,currency_attested=false,currency_confirmed_at=null where id='${wallet}'; raise exception 'currency cleared'; exception when check_violation then null; end;
      begin update market_quote_cache set price=99 where id='${cache}'; raise exception 'direct cache patch allowed'; exception when insufficient_privilege then null; end;
      begin insert into market_quote_cache(user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,instrument_type)
        values('${foreign}','yahoo','FOREIGN','NMS','USD','UTC','Foreign','Nasdaq','EQUITY');
        raise exception 'foreign cache inserted'; exception when insufficient_privilege then null; end;
    end $$;
    ${assertSql("(select count(*)=1 from market_quote_cache)", "cache RLS leaked foreign quote")}
    ${assertSql(`public.claim_market_quote_refresh('${otherCache}') is null`, "foreign lease claimed")}
    update positions set market_listing_id='${cache}' where id='${position}';
    ${assertSql("(select instrument='Original diary label' and manual_price_saved_at is null from positions)", "link changed diary facts or save time")}
  `);
  // Atomic claims in separate PostgreSQL connections; exactly one gets a lease.
  const claims = await Promise.all([competingClaim(), competingClaim()]);
  const winners = claims.filter(Boolean);
  assert.equal(winners.length, 1, "concurrent claims both won");
  const firstToken = winners[0];
  assert.equal(own(finish(firstToken)), "t");
  own(
    `${assertSql("(select selected_price=12 and selected_source='automatic' from position_effective_prices)", "automatic quote not selected")}`,
  );
  const failureToken = own(`select public.claim_market_quote_refresh('${cache}');`);
  assert.ok(failureToken, "successful download age incorrectly blocks explicit next claim");
  own(`select public.finish_market_quote_refresh('${cache}','${failureToken}','timeout',in_retry_after=>statement_timestamp()+interval '1 hour');
    ${assertSql("(select price=12 and refresh_outcome='timeout' and cooldown_until>statement_timestamp()+interval '59 minutes' from market_quote_cache)", "failure lost quote or longer retry delay")}
    ${assertSql("(select selected_source='automatic' and selected_price=12 and quote_state='cooldown' from position_effective_prices)", "failure discarded selected automatic value")}
    ${assertSql(`public.claim_market_quote_refresh('${cache}') is null`, "cooldown allowed claim")}`);
  sql(`update market_quote_cache set cooldown_until=statement_timestamp()-interval '1 second' where id='${cache}';`);
  const abandoned = own(`select public.claim_market_quote_refresh('${cache}');`);
  sql(`update market_quote_cache set lease_until=statement_timestamp()-interval '1 second' where id='${cache}';`);
  const recovered = own(`select public.claim_market_quote_refresh('${cache}');`);
  assert.ok(recovered && recovered !== abandoned);
  assert.equal(own(finish(abandoned, "99")), "f", "late worker replaced new claim");
  assert.equal(own(finish(recovered, "99", "'2025-12-31T12:00:00Z'")), "f", "older quote replaced cache");
  own(
    assertSql(
      "(select price=12 and market_at='2026-01-01T12:00:00Z' and lease_token is null from market_quote_cache)",
      "old replacement changed valid quote",
    ),
  );
  // Manual save boundary uses DB save time, not editable price_date.
  own(`update positions set current_price=15,price_date='2026-01-02' where id='${position}';
    ${assertSql("(select selected_source='manual_override' and selected_price=15 from position_effective_prices)", "manual correction ignored")}
    do $$ begin begin update positions set manual_price_saved_at='2020-01-01' where id='${position}';
      raise exception 'manual timestamp spoof allowed'; exception when check_violation then null; end; end $$;`);
  const saved = own(`select manual_price_saved_at from positions where id='${position}';`);
  sql(
    `update market_quote_cache set market_at='${saved}',market_date=('${saved}'::timestamptz at time zone 'UTC')::date,fetched_at=statement_timestamp(),price=16 where id='${cache}';`,
  );
  own(
    assertSql(
      "(select selected_source='manual_override' and selected_price=15 from position_effective_prices)",
      "equal market timestamp replaced manual correction",
    ),
  );
  sql(
    `update market_quote_cache set market_at='${saved}'::timestamptz+interval '1 microsecond',fetched_at=statement_timestamp() where id='${cache}';`,
  );
  own(
    assertSql(
      "(select selected_source='automatic' and selected_price=16 from position_effective_prices)",
      "strictly later timestamp did not replace correction",
    ),
  );
  own(`update positions set current_price=15,price_date='2026-01-02' where id='${position}';
    ${assertSql(`(select manual_price_saved_at>'${saved}'::timestamptz from positions)`, "identical manual resave did not stamp")}
    ${assertSql("(select selected_source='manual_override' and selected_price=15 from position_effective_prices)", "identical resave did not restore override")}
    update positions set sell_price=0,sell_date='2026-01-02' where id='${position}';
    ${assertSql("(select selected_source='sale' and selected_price=0 from position_effective_prices)", "sale did not win")}
    update positions set market_listing_id=null,sell_price=null,sell_date=null where id='${position}';
    ${assertSql("(select selected_source='manual' and selected_price=15 from position_effective_prices)", "unlinked manual fallback lost")}
    update positions set current_price=null,price_date=null where id='${position}';
    ${assertSql("(select selected_source='missing' and selected_price is null from position_effective_prices)", "missing became price")}`);
  // Different denominations cannot link; existing full identities do not collide.
  own(`insert into market_quote_cache(user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,instrument_type)
    values(auth.uid(),'yahoo','AAPL','NMS','EUR','UTC','Apple EUR','Nasdaq','EQUITY');
    do $$ declare eur uuid; begin
      select id into eur from market_quote_cache where currency='EUR';
      begin update positions set market_listing_id=eur where id='${position}';
        raise exception 'incompatible listing linked'; exception when check_violation then null; end;
    end $$;`);
  own(
    `${assertSql("not exists(select 1 from position_effective_prices)", "effective view leaked foreign position")}
    ${assertSql(`not public.finish_market_quote_refresh('${cache}','${recovered}','timeout')`, "foreign finish accepted")}`,
    foreign,
  );
  sql(
    `set role anon; ${assertSql("not has_table_privilege('anon','public.market_quote_cache','select')", "anonymous cache permission")}`,
  );
  console.log(
    "PASS market-price migration: preserved legacy/history, currency confirmation/freeze, owner isolation, exact selection, manual boundaries, competing leases, cooldowns and older-quote rejection",
  );
} finally {
  if (created) run(["dropdb", "-U", "postgres", database]);
}
