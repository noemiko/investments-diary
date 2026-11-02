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
const revision = "20261030140619_set_wallet_denominations.sql";
const revisionIndex = files.indexOf(revision);
if (revisionIndex < 0) throw new Error("Denomination revision migration missing");
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
    grant all on public.positions,public.wallets,public.reason_categories to authenticated,anon;
    ${files.slice(split, revisionIndex).map(migration).join("\n")}
    ${assertSql("(select currency is null and not currency_attested and currency_confirmed_at is null from wallets)", "legacy currency guessed")}
    ${assertSql("(select manual_price_saved_at is null and market_listing_id is null from positions)", "legacy save time guessed")}
    ${assertSql("not exists(select 1 from wallets w,fixture_wallets_before b where to_jsonb(w)-'currency'-'currency_attested'-'currency_confirmed_at' <> b.facts)", "legacy wallet facts changed")}
    ${assertSql("not exists(select 1 from positions p,fixture_positions_before b where to_jsonb(p)-'manual_price_saved_at'-'market_listing_id'-'listing_confirmed_at' <> b.facts)", "legacy position facts changed")}
    ${assertSql("not exists(select 1 from wallet_snapshots s,fixture_snapshots_before b where to_jsonb(s)-'currency'-'automatic_count'-'manual_count'-'oldest_market_at' <> to_jsonb(b))", "old observations changed")}
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
  // P4: ordinary direct PATCH cannot bypass move attestation/currency contracts.
  own(`do $$ begin
    begin update positions set wallet_id='${wallet}' where id='${position}';
      raise exception 'direct wallet assignment allowed'; exception when insufficient_privilege then null; end;
  end $$;`);
  sql(`alter table public.wallets disable trigger wallets_guard_currency;
    insert into wallets(id,user_id,name,starting_value) values
      ('10000000-0000-4000-8000-000000000003','${owner}','Legacy split',0);
    alter table public.wallets enable trigger wallets_guard_currency;
    insert into wallets(id,user_id,name,starting_value,currency,currency_attested) values
      ('10000000-0000-4000-8000-000000000002','${owner}','USD target',0,'USD',true),
      ('10000000-0000-4000-8000-000000000004','${owner}','PLN target',0,'PLN',true),
      ('10000000-0000-4000-8000-000000000005','${foreign}','Foreign wallet',0,'USD',true);
    insert into positions(id,user_id,wallet_id,category_id,instrument,buy_date,buy_price,quantity,current_price,price_date,sell_price,sell_date)
      values('20000000-0000-4000-8000-000000000002','${owner}','10000000-0000-4000-8000-000000000003','${wallet}','Legacy closed','2026-01-01',10,2,11,'2026-01-02',0,'2026-01-03');
    create table fixture_move_facts as select to_jsonb(p)-'wallet_id' facts from positions p where id='20000000-0000-4000-8000-000000000002';
    create table fixture_old_observations as select to_jsonb(s) facts from wallet_snapshots s;
    grant select on fixture_move_facts to authenticated;
  `);
  own(`${assertSql(`public.move_position_to_wallet('${position}','10000000-0000-4000-8000-000000000004',true)='incompatible_currency'`, "confirmed currency conflict allowed")}
    ${assertSql(`public.move_position_to_wallet('${position}','10000000-0000-4000-8000-000000000005',true)='not_found'`, "foreign target allowed")}
    ${assertSql(`public.move_position_to_wallet('${position}','10000000-0000-4000-8000-000000000003',true)='currency_required'`, "unconfirmed target allowed")}
    ${assertSql("public.move_position_to_wallet('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',false)='attestation_required'", "legacy move omitted attestation")}
    ${assertSql("public.move_position_to_wallet('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true)='success'", "attested legacy closed move failed")}
    ${assertSql("(select currency is null from wallets where id='10000000-0000-4000-8000-000000000003')", "move confirmed source currency")}
    ${assertSql("not exists(select 1 from positions p,fixture_move_facts f where p.id='20000000-0000-4000-8000-000000000002' and to_jsonb(p)-'wallet_id'<>f.facts)", "move changed position facts")}
  `);
  // A fresh day is simulated only in this disposable fixture, retaining the prior observations.
  sql(`update wallet_snapshots set captured_at=captured_at-interval '1 day',observation_day=observation_day-1;
    update positions set current_price=null,price_date=null,market_listing_id='${cache}' where id='${position}';
    update market_quote_cache set price=20,market_at='2026-01-05T12:00:00Z',market_date='2026-01-05',fetched_at=statement_timestamp() where id='${cache}';
    select public.capture_wallet_snapshots();
    ${assertSql("exists(select 1 from wallet_snapshots where currency is null and automatic_count is null and manual_count is null)", "legacy history relabelled")}
    ${assertSql(`exists(select 1 from wallet_snapshots where wallet_id='${wallet}' and observation_day=(now() at time zone 'UTC')::date and value=1020 and currency='USD' and automatic_count=1 and manual_count=0 and oldest_market_at='2026-01-05T12:00:00Z')`, "capture ignored cached effective price or source metadata")}
    ${assertSql("exists(select 1 from wallet_snapshots where wallet_id='10000000-0000-4000-8000-000000000002' and value=-20 and realised_count=1 and automatic_count=0 and manual_count=0 and oldest_market_at is null)", "zero-sale moved capture mismatch")}
    ${assertSql("not exists(select 1 from fixture_old_observations f where not exists(select 1 from wallet_snapshots s where to_jsonb(s)-'captured_at'-'observation_day'=f.facts-'captured_at'-'observation_day'))", "old snapshot facts rewritten")}
  `);
  own(`update positions set current_price=25,price_date='2026-01-02' where id='${position}';
    insert into positions(user_id,wallet_id,category_id,instrument,buy_date,buy_price,current_price,price_date)
      values(auth.uid(),'${wallet}','${wallet}','Excluded quantity','2026-01-01',10,20,'2026-01-02');`);
  sql(`update wallet_snapshots set captured_at=captured_at-interval '1 day',observation_day=observation_day-1;
    select public.capture_wallet_snapshots();
    ${assertSql(`exists(select 1 from wallet_snapshots where wallet_id='${wallet}' and observation_day=(now() at time zone 'UTC')::date and value=1030 and automatic_count=0 and manual_count=1 and oldest_market_at is null and not_counted=1)`, "manual override/excluded coverage mismatch")}
    ${assertSql(`exists(select 1 from wallet_snapshots where wallet_id='${wallet}' and value=1020 and automatic_count=1 and oldest_market_at='2026-01-05T12:00:00Z')`, "later correction rewrote saved automatic observation")}
  `);
  // The earlier assertions exercise immutable historical migration contracts. Apply the
  // user-approved revision now and assert its current schema and preservation guarantees.
  sql(`create table fixture_currency_wallets as select to_jsonb(w) facts from wallets w;
    create table fixture_currency_positions as select to_jsonb(p) facts from positions p;
    create table fixture_currency_observations as select to_jsonb(s) facts from wallet_snapshots s;
    ${assertSql("exists(select 1 from wallets where currency is null)", "revision fixture has no unspecified wallet")}
    ${assertSql("exists(select 1 from wallet_snapshots where currency is null)", "revision fixture has no unspecified history")}
    ${files.slice(revisionIndex).map(migration).join("\n")}
    ${assertSql("(select count(*) from positions)=(select count(*) from fixture_currency_positions)", "selection revision lost historical positions")}
    ${assertSql("not exists(select 1 from positions p join fixture_currency_positions b on p.id=(b.facts->>'id')::uuid where to_jsonb(p)-'market_target_id'-'market_selection_receipt_id'<>b.facts)", "selection revision changed existing position facts")}
    ${assertSql("(select count(*) from wallets)=(select count(*) from fixture_currency_wallets)", "currency revision lost wallet rows")}
    ${assertSql("(select count(*) from wallet_snapshots)=(select count(*) from fixture_currency_observations)", "currency revision lost observations")}
    ${assertSql("not exists(select 1 from wallets where currency is null)", "wallet denomination still unspecified")}
    ${assertSql("(select currency='USD' from wallets where id='10000000-0000-4000-8000-000000000003')", "existing unspecified wallet did not become USD")}
    ${assertSql("not exists(select 1 from wallets w join fixture_currency_wallets b on w.id=(b.facts->>'id')::uuid where to_jsonb(w)-'currency'<>b.facts-'currency'-'currency_attested'-'currency_confirmed_at' or w.currency<>coalesce(b.facts->>'currency','USD'))", "currency revision changed wallet facts or existing denomination")}
    ${assertSql("not exists(select 1 from wallet_snapshots s join fixture_currency_observations b on s.wallet_id=(b.facts->>'wallet_id')::uuid and s.observation_day=(b.facts->>'observation_day')::date where to_jsonb(s)-'currency'<>b.facts-'currency')", "currency revision changed historical amounts dates or source coverage")}
    ${assertSql("not exists(select 1 from wallet_snapshots s join wallets w on w.id=s.wallet_id where s.currency is null or s.currency<>w.currency)", "old observations did not inherit wallet denomination")}
    ${assertSql("exists(select 1 from wallet_snapshots where currency='USD' and automatic_count is null and manual_count is null)", "historical source coverage was invented")}
    ${assertSql("not exists(select 1 from pg_attribute where attrelid='public.wallets'::regclass and not attisdropped and attname in ('currency_attested','currency_confirmed_at'))", "obsolete confirmation metadata retained")}
    ${assertSql("to_regprocedure('public.move_position_to_wallet(uuid,uuid,boolean)') is null", "obsolete move attestation API retained")}
  `);
  own(`insert into wallets(user_id,name,starting_value) values(auth.uid(),'Default denomination',123);
    ${assertSql("exists(select 1 from wallets where name='Default denomination' and currency='USD')", "default USD wallet failed")}
    ${assertSql("public.move_position_to_wallet('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003')='success'", "USD move still required attestation")}
    ${assertSql(`public.move_position_to_wallet('${position}','10000000-0000-4000-8000-000000000004')='incompatible_currency'`, "currency mismatch protection removed")}
    do $$ begin begin update wallets set currency='PLN' where name='Default denomination';
      raise exception 'wallet currency changed'; exception when check_violation then null; end; end $$;
  `);
  // Inspect the effective installed definition after the complete migration chain, not an obsolete source file.
  const captureBody = sql("select pg_get_functiondef('public.capture_wallet_snapshots()'::regprocedure)");
  assert.doesNotMatch(
    captureBody,
    /\b(?:http_get|http_post|http_request)\s*\(|\bnet\.(?:http_get|http_post)\s*\(/i,
    "snapshot capture invokes HTTP",
  );
  sql(`${assertSql("(select relrowsecurity from pg_class where oid='public.market_listing_lookups'::regclass)", "lookup receipt RLS disabled")}
    ${assertSql("(select count(*)=3 from pg_policies where tablename='market_listing_lookups' and roles=array['authenticated']::name[])", "lookup operation policies missing")}`);
  console.log(
    "PASS market-price migrations: USD denomination backfill, unchanged historical amounts/dates/coverage, frozen currency, owner isolation, effective selection, moves, leases and cooldowns",
  );
} finally {
  if (created) run(["dropdb", "-U", "postgres", database]);
}
