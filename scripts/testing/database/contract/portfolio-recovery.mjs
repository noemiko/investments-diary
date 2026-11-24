import { asAnon, asPrivileged, asUser, assert, expectError, fixtureId } from "../lib/db-harness.mjs";

const id = (kind, index = 1) => fixtureId("portfolio-recovery", kind, index);
const owner = id(0);
const other = id(0, 2);
const service = "set role service_role; set request.jwt.claim.sub = '';";
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const expectFailure = (code, statement, message) =>
  expectError(code, statement.replace(/^select /, "perform "), message);
const inBlock = (statement) => statement.replace(/^select /, "perform ");
const fingerprint = (db) => db.sql(`${service} select public.portfolio_recovery_preview('${owner}')->>'fingerprint';`);
const replace = (data, fp, operation) =>
  `select public.portfolio_replace('${owner}',${literal(JSON.stringify(data))}::jsonb,${literal(fp)},'${operation}');`;
const empty = () => ({ wallets: [], categories: [], positions: [], targets: [], quotes: [] });
const base = "2026-01-01T00:00:00Z";
function imported() {
  const wallet = id(10),
    category = id(11),
    target = id(12),
    quote = id(13);
  const common = {
    wallet_id: wallet,
    category_id: category,
    instrument: "AAPL",
    buy_date: "2026-01-01",
    buy_price: "100.00000001",
    quantity: "2.00000001",
    opening_commission: "1.00000001",
    closing_commission: "0",
    broker_label: "Exported",
    reason_text: "Original thesis\nUnicode ąęł",
    created_at: base,
    deleted_at: null,
    current_price: "110.00000001",
    price_date: "2026-01-02",
    manual_price_saved_at: "2026-01-02T12:00:00Z",
    sell_price: null,
    sell_date: null,
    market_target_id: target,
    market_listing_id: quote,
    listing_confirmed_at: "2026-01-02T13:00:00Z",
  };
  return {
    wallets: [
      { id: wallet, name: "Recovered", starting_value: "999999999999.12345678", currency: "USD", created_at: base },
    ],
    categories: [{ id: category, name: "Retired original", created_at: base, deleted_at: "2026-02-01T00:00:00Z" }],
    targets: [
      {
        id: target,
        provider: "yahoo",
        symbol: "AAPL",
        exchange: "NMS",
        listing_name: "Apple",
        exchange_name: "Nasdaq",
        instrument_type: "EQUITY",
        cache_id: quote,
      },
    ],
    quotes: [
      {
        id: quote,
        provider: "yahoo",
        symbol: "AAPL",
        exchange: "NMS",
        listing_name: "Apple",
        exchange_name: "Nasdaq",
        instrument_type: "EQUITY",
        currency: "USD",
        timezone: "America/New_York",
        price: "123.12345678",
        market_at: "2026-01-03T21:00:00Z",
        market_date: "2026-01-03",
        fetched_at: "2026-01-03T21:05:00Z",
        market_state: "CLOSED",
        delay_minutes: "15",
        source_interval_minutes: "1",
        source_name: "Yahoo",
        created_at: base,
      },
    ],
    positions: [
      { ...common, id: id(14), broker_label: "automatic" },
      { ...common, id: id(14, 2), broker_label: "override", manual_price_saved_at: "2026-01-04T00:00:00Z" },
      { ...common, id: id(14, 3), broker_label: "legacy", manual_price_saved_at: null },
      {
        ...common,
        id: id(14, 4),
        broker_label: "closed",
        sell_price: "0",
        sell_date: "2026-02-01",
        closing_commission: "2.00000001",
      },
    ],
  };
}
export default async function portfolioRecovery(db) {
  db.sql(`${asPrivileged()}
    insert into auth.users(id) values('${owner}'),('${other}');
    insert into public.wallets(id,user_id,name,starting_value,currency) values
      ('${id(1)}','${owner}','Original',0,'USD'),('${id(1, 2)}','${other}','Foreign',500,'EUR');
    insert into public.reason_categories(id,user_id,name) values('${id(2)}','${owner}','Original category');
    insert into public.market_listing_targets(id,user_id,provider,symbol,exchange,listing_name,exchange_name,instrument_type)
      values('${id(3)}','${owner}','yahoo','AAPL','NMS','Apple','Nasdaq','EQUITY');
    insert into public.market_selection_receipts(id,user_id,wallet_id,target_id)
      values('${id(4)}','${owner}','${id(1)}','${id(3)}');
    insert into public.positions(id,user_id,instrument,buy_price,buy_date,category_id,wallet_id,market_selection_receipt_id)
      values('${id(5)}','${owner}','AAPL',10,'2026-01-01','${id(2)}','${id(1)}','${id(4)}'),
      ('${id(5, 2)}','${owner}','AAPL',20,'2026-01-01','${id(2)}','${id(1)}','${id(4)}');
    update public.positions set deleted_at=statement_timestamp() where id='${id(5, 2)}';
    insert into public.wallet_snapshots(wallet_id,user_id,observation_day,captured_at,starting_value,value,realised_change,
      open_change,realised_count,open_count,not_counted,currency)
      values('${id(1)}','${owner}','2026-01-01','2026-01-01T00:00:00Z',0,
        -1000000000000000000000000.0000000000000001,-1000000000000000000000000.0000000000000001,0,1,0,0,'USD');
    ${assert("not has_function_privilege('authenticated','public.portfolio_replace(uuid,jsonb,text,uuid)','execute')", "authenticated replacement exposed")}
    ${assert("not has_function_privilege('anon','public.portfolio_undo(uuid,text,uuid,uuid)','execute')", "anonymous undo exposed")}
    ${assert("(select proconfig @> array['statement_timeout=15s','lock_timeout=2s'] from pg_proc where oid='public.portfolio_replace(uuid,jsonb,text,uuid)'::regprocedure)", "replacement timeouts absent")}
    ${asUser(owner)}
    ${expectFailure("42501", `perform public.portfolio_replace('${owner}','{}','x','${id(20)}')`, "direct replacement allowed")}
    ${expectFailure("42501", `insert into portfolio_recovery.position_staging values(txid_current(),'${owner}','${id(5)}','{}')`, "client can forge restoration staging")}
    ${expectFailure("42501", `delete from public.wallets where user_id='${owner}'`, "direct wallet DELETE exposed")}
    ${asAnon()}
    ${expectFailure("42501", `perform public.portfolio_recovery_preview('${owner}')`, "anonymous preview exposed")}
  `);
  const foreignBefore = db.sql(`${asPrivileged()} select portfolio_recovery.owner_state('${other}')::text;`);
  const original = fingerprint(db);
  const bad = imported();
  bad.positions[0].buy_price = "-1"; // Check failure happens after the destructive statements, proving rollback.
  db.sql(`${service} ${expectFailure("23514", replace(bad, original, id(20)), "invalid investment accepted")}`);
  if (fingerprint(db) !== original) throw new Error("failed install changed the previous portfolio");
  db.sql(
    `${asPrivileged()} ${assert(`not exists(select 1 from portfolio_recovery.undo_copies where user_id='${owner}')`, "failed install left an undo copy")}`,
  );

  const source = imported();
  const first = db.sql(`${service} ${replace(source, original, id(20, 2))}`);
  const replay = db.sql(`${service} ${replace(source, original, id(20, 2))}`);
  if (first !== replay) throw new Error("duplicate successful commit did not return its original result");
  db.sql(
    `${service} ${expectFailure("22023", replace(empty(), original, id(20, 2)), "operation id reused for a different payload")}`,
  );
  const after = fingerprint(db);
  db.sql(`${asPrivileged()}
    ${assert(`not exists(select 1 from public.wallets where id='${id(1)}')`, "replacement retained old wallet")}
    ${assert(`not exists(select 1 from public.positions where id in ('${id(14)}','${id(5)}'))`, "replacement reused source or destination IDs")}
    ${assert(`(select count(*)=4 from public.positions where user_id='${owner}')`, "replacement was incomplete")}
    ${assert(`(select starting_value::text='999999999999.12345678' from public.wallets where user_id='${owner}')`, "replacement rounded starting value")}
    ${assert(`(select selected_source='automatic' and selected_price::text='123.12345678' from public.position_effective_prices where user_id='${owner}' and broker_label='automatic')`, "automatic quote lost precedence")}
    ${assert(`(select selected_source='manual_override' and selected_price::text='110.00000001' from public.position_effective_prices where user_id='${owner}' and broker_label='override')`, "manual override lost precedence")}
    ${assert(`(select manual_price_saved_at is null and selected_source='automatic' from public.position_effective_prices where user_id='${owner}' and broker_label='legacy')`, "legacy null manual time was invented")}
    ${assert(`(select selected_source='sale' and selected_price=0 and closing_commission::text='2.00000001' from public.position_effective_prices where user_id='${owner}' and broker_label='closed')`, "zero sale or commission changed")}
    ${assert(`not exists(select 1 from public.market_quote_cache where user_id='${owner}' and (lease_token is not null or lease_until is not null or cooldown_until is not null))`, "refresh execution state restored")}
    ${assert(`not exists(select 1 from portfolio_recovery.position_staging)`, "staging survived restoration")}
    ${assert(`(select count(*)=1 from public.reason_categories where user_id='${owner}' and deleted_at is not null)`, "retired category lost")}
    ${asUser(owner)}
    ${assert(`(select count(*)=1 from portfolio_recovery.undo_copies where user_id='${owner}')`, "owner cannot read undo metadata")}
    ${expectFailure("42501", "perform data from portfolio_recovery.undo_copies", "client can read stored undo payload")}
  `);
  const undoBeforeFailure = db.sql(
    `${asPrivileged()} select data::text from portfolio_recovery.undo_copies where user_id='${owner}';`,
  );
  db.sql(`${service} ${expectFailure("23514", replace(bad, after, id(20, 3)), "invalid second install accepted")}`);
  if (
    fingerprint(db) !== after ||
    db.sql(`${asPrivileged()} select data::text from portfolio_recovery.undo_copies where user_id='${owner}';`) !==
      undoBeforeFailure
  )
    throw new Error("failed replacement changed current state or prior undo copy");
  db.sql(`${service} ${expectFailure("40001", replace(empty(), original, id(20, 4)), "stale preview accepted")}`);

  // Ordinary quote claim/finish still updates a restored cache using the existing timestamp rules.
  db.sql(`${asUser(owner)} do $quote$ declare cache uuid; token uuid; begin
      select id into cache from public.market_quote_cache where user_id='${owner}';
      token:=public.claim_market_quote_refresh(cache);
      if token is null then raise exception 'restored quote could not be claimed'; end if;
      perform public.finish_market_quote_refresh(cache,token,'success',125,'2026-01-05T21:00:00Z',
        '2026-01-05','2026-01-05T21:05:00Z','CLOSED',15,1,'Yahoo',null);
    end $quote$;
    ${assert(`(select selected_source='automatic' and selected_price=125 from public.position_effective_prices where user_id='${owner}' and broker_label='override')`, "new quote did not supersede historical manual override")}`);

  // Ordinary manual resubmission must still stamp now and take precedence over the restored quote.
  db.sql(`${asUser(owner)} update public.positions set current_price=111,price_date='2026-01-05'
      where user_id='${owner}' and broker_label='automatic';
    ${assert(`(select selected_source='manual_override' and selected_price=111 from public.position_effective_prices where user_id='${owner}' and broker_label='automatic')`, "ordinary manual resubmission no longer stamps time")}`);
  const undoId = db.sql(`${service} select public.portfolio_recovery_preview('${owner}')#>>'{undo,snapshot_id}';`);
  const beforeUndo = fingerprint(db);
  db.sql(`${service} select public.portfolio_undo('${owner}','${beforeUndo}','${id(20, 5)}','${undoId}');`);
  db.sql(`${asPrivileged()}
    ${assert(`(select name='Original' from public.wallets where user_id='${owner}')`, "undo did not restore original wallet")}
    ${assert(`(select count(*)=2 from public.positions where user_id='${owner}')`, "undo omitted original investments")}
    ${assert(`(select count(*)=1 from public.positions where user_id='${owner}' and deleted_at is not null)`, "undo omitted deleted investment")}
    ${assert(`(select value::text='-1000000000000000000000000.0000000000000001' from public.wallet_snapshots where user_id='${owner}')`, "undo rounded or lost historical observations")}`);
  if (db.sql(`${asPrivileged()} select portfolio_recovery.owner_state('${other}')::text;`) !== foreignBefore)
    throw new Error("foreign account changed during replacement or undo");

  // Concurrent restores from the same preview: exactly one wins; the other sees a stale destination.
  const current = fingerprint(db);
  const outcome = (op) => `${service} do $race$ begin ${inBlock(replace(source, current, op))}
    raise notice 'winner'; exception when serialization_failure then raise notice 'stale'; end $race$;`;
  // Results are verified from operation receipts rather than NOTICE output (the harness keeps stdout only).
  await db.concurrent(outcome(id(30)), outcome(id(30, 2)));
  db.sql(
    `${asPrivileged()} ${assert(`(select count(*)=1 from portfolio_recovery.operations where user_id='${owner}' and operation_id in ('${id(30)}','${id(30, 2)}'))`, "concurrent restores did not produce one complete winner")}`,
  );

  // A pre-existing ordinary writer holds its lock; restore must time out and roll back untouched.
  const lockedFingerprint = fingerprint(db);
  const writer = db.concurrent(
    `begin; ${asUser(owner)} update public.wallets set name=name where user_id='${owner}'; select pg_sleep(3); commit;`,
    `${service} select pg_sleep(0.2); ${expectFailure("55P03", replace(empty(), lockedFingerprint, id(31)), "restore did not respect lock timeout")}`,
  );
  await writer;
  if (fingerprint(db) !== lockedFingerprint) throw new Error("lock-timeout recovery changed the portfolio");

  // A writer that committed after the preview makes replacement stale instead of silently losing the edit.
  const stale = fingerprint(db);
  await db.concurrent(
    `begin; ${asUser(owner)} update public.wallets set name='Edited while confirming' where user_id='${owner}'; select pg_sleep(0.4); commit;`,
    `${service} select pg_sleep(0.1); ${expectFailure("40001", replace(empty(), stale, id(32)), "concurrent wallet edit was overwritten")}`,
  );
  db.sql(
    `${asPrivileged()} ${assert(`(select name='Edited while confirming' from public.wallets where user_id='${owner}')`, "ordinary edit was lost")}`,
  );
  return "atomic replacement/undo preserve exact valuation and deleted/history data, reject stale/duplicate-conflicting operations and serialize ordinary writes";
}
