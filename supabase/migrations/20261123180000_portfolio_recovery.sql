-- Trusted recovery is separate from ordinary diary writes. No new public DELETE grant or trigger bypass.
create schema portfolio_recovery;
revoke all on schema portfolio_recovery from public, anon, authenticated;

create table portfolio_recovery.undo_copies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot_id uuid not null default gen_random_uuid(),
  saved_at timestamptz not null default statement_timestamp(),
  data jsonb not null
);
alter table portfolio_recovery.undo_copies enable row level security;
create policy undo_metadata_own on portfolio_recovery.undo_copies for select to authenticated
  using ((select auth.uid()) = user_id);
grant usage on schema portfolio_recovery to authenticated;
grant select(user_id,snapshot_id,saved_at) on portfolio_recovery.undo_copies to authenticated;

create table portfolio_recovery.operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  kind text not null check (kind in ('replace','undo')),
  request_hash text not null,
  result jsonb not null,
  primary key(user_id,operation_id)
);
alter table portfolio_recovery.operations enable row level security;

-- This table is not exposed by PostgREST and cannot be written by an authenticated client.
create table portfolio_recovery.position_staging (
  transaction_id bigint not null,
  user_id uuid not null,
  position_id uuid not null,
  state jsonb not null,
  primary key(transaction_id,user_id,position_id)
);
alter table portfolio_recovery.position_staging enable row level security;
revoke all on all tables in schema portfolio_recovery from public,anon,authenticated;
grant select(user_id,snapshot_id,saved_at) on portfolio_recovery.undo_copies to authenticated;

create function portfolio_recovery.owner_state(in_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'wallets',coalesce((select jsonb_agg(to_jsonb(w) || jsonb_build_object('starting_value',w.starting_value::text) order by w.id)
      from public.wallets w where w.user_id=in_user_id),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.id)
      from public.reason_categories c where c.user_id=in_user_id),'[]'::jsonb),
    'positions',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'buy_price',p.buy_price::text,'quantity',p.quantity::text,'current_price',p.current_price::text,
      'sell_price',p.sell_price::text,'opening_commission',p.opening_commission::text,
      'closing_commission',p.closing_commission::text) order by p.id)
      from public.positions p where p.user_id=in_user_id),'[]'::jsonb),
    'targets',coalesce((select jsonb_agg(to_jsonb(t) - array['lease_token','lease_until','cooldown_until'] order by t.id)
      from public.market_listing_targets t where t.user_id=in_user_id),'[]'::jsonb),
    'quotes',coalesce((select jsonb_agg((to_jsonb(q) - array['lease_token','lease_until','cooldown_until','attempted_at']) || jsonb_build_object(
      'price',q.price::text,'delay_minutes',q.delay_minutes::text,'source_interval_minutes',q.source_interval_minutes::text) order by q.id)
      from public.market_quote_cache q where q.user_id=in_user_id),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
      'starting_value',s.starting_value::text,'value',s.value::text,'realised_change',s.realised_change::text,
      'open_change',s.open_change::text) order by s.wallet_id,s.observation_day)
      from public.wallet_snapshots s where s.user_id=in_user_id),'[]'::jsonb)
  );
$$;

create function portfolio_recovery.state_counts(in_data jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'wallets',jsonb_array_length(in_data->'wallets'),
    'open', (select count(*) from jsonb_array_elements(in_data->'positions') p where p->>'deleted_at' is null and p->>'sell_price' is null),
    'closed',(select count(*) from jsonb_array_elements(in_data->'positions') p where p->>'deleted_at' is null and p->>'sell_price' is not null),
    'deleted',(select count(*) from jsonb_array_elements(in_data->'positions') p where p->>'deleted_at' is not null),
    'snapshots',coalesce(jsonb_array_length(in_data->'snapshots'),0)
  );
$$;

create function portfolio_recovery.fingerprint(in_state jsonb) returns text
language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(in_state::text,'UTF8')),'hex');
$$;

create function public.portfolio_recovery_preview(in_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare current_state jsonb; saved portfolio_recovery.undo_copies;
begin
  if not exists(select 1 from auth.users where id=in_user_id) then
    raise exception 'Unknown recovery destination' using errcode='22023';
  end if;
  current_state:=portfolio_recovery.owner_state(in_user_id);
  select * into saved from portfolio_recovery.undo_copies where user_id=in_user_id;
  return jsonb_build_object('fingerprint',portfolio_recovery.fingerprint(current_state),
    'counts',portfolio_recovery.state_counts(current_state),
    'undo',case when saved.user_id is not null then jsonb_build_object('snapshot_id',saved.snapshot_id,
      'saved_at',saved.saved_at,'counts',portfolio_recovery.state_counts(saved.data)) else null end);
end $$;

-- Runs after positions_z_stamp_manual_price. Only a row staged inside trusted restoration can apply history.
create function portfolio_recovery.apply_position_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare saved jsonb; wallet_currency text; target public.market_listing_targets; quote public.market_quote_cache;
begin
  delete from portfolio_recovery.position_staging
    where transaction_id=txid_current() and user_id=NEW.user_id and position_id=NEW.id returning state into saved;
  if not found then return NEW; end if;
  if (saved->>'market_target_id')::uuid is distinct from NEW.market_target_id then
    raise exception 'Restored target does not match selection' using errcode='23514';
  end if;
  select currency into wallet_currency from public.wallets where id=NEW.wallet_id and user_id=NEW.user_id;
  select * into strict target from public.market_listing_targets where id=NEW.market_target_id and user_id=NEW.user_id;
  NEW.manual_price_saved_at:=(saved->>'manual_price_saved_at')::timestamptz;
  NEW.market_listing_id:=(saved->>'market_listing_id')::uuid;
  NEW.listing_confirmed_at:=(saved->>'listing_confirmed_at')::timestamptz;
  NEW.instrument:=saved->>'instrument';
  if NEW.market_listing_id is not null then
    select * into strict quote from public.market_quote_cache where id=NEW.market_listing_id and user_id=NEW.user_id;
    if quote.currency is distinct from wallet_currency or
       (quote.provider,quote.symbol,quote.exchange,quote.instrument_type) is distinct from
       (target.provider,target.symbol,target.exchange,target.instrument_type) then
      raise exception 'Restored listing does not match wallet and target' using errcode='23514';
    end if;
  end if;
  return NEW;
end $$;
create trigger positions_zz_restore_saved_state before insert on public.positions
for each row execute function portfolio_recovery.apply_position_history();

-- Caller holds the portfolio write locks. The complete replacement remains inside the calling transaction.
create function portfolio_recovery.install_state(in_user_id uuid,in_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare ids jsonb; item jsonb; new_id uuid; receipt_id uuid; new_wallet uuid; new_target uuid; position_state jsonb;
begin
  if jsonb_typeof(in_data) <> 'object' or exists(
    select 1 from unnest(array['wallets','categories','positions','targets','quotes']) k
      where jsonb_typeof(in_data->k) is distinct from 'array') then
    raise exception 'Invalid recovery data' using errcode='22023';
  end if;
  select jsonb_object_agg(kind, mapping) into ids from (
    select kind,coalesce((select jsonb_object_agg(r->>'id',gen_random_uuid()) from jsonb_array_elements(in_data->kind) r),'{}'::jsonb) mapping
    from unnest(array['wallets','categories','positions','targets','quotes']) kind
  ) maps;
  delete from public.positions where user_id=in_user_id;
  delete from public.market_selection_receipts where user_id=in_user_id;
  delete from public.wallets where user_id=in_user_id;
  delete from public.reason_categories where user_id=in_user_id;
  delete from public.market_listing_targets where user_id=in_user_id;
  delete from public.market_quote_cache where user_id=in_user_id;

  for item in select value from jsonb_array_elements(in_data->'wallets') loop
    insert into public.wallets(id,user_id,name,starting_value,currency,created_at)
      values ((ids#>>array['wallets',item->>'id'])::uuid,in_user_id,item->>'name',(item->>'starting_value')::numeric,
        item->>'currency',(item->>'created_at')::timestamptz);
  end loop;
  for item in select value from jsonb_array_elements(in_data->'categories') loop
    insert into public.reason_categories(id,user_id,name,created_at,deleted_at)
      values ((ids#>>array['categories',item->>'id'])::uuid,in_user_id,item->>'name',(item->>'created_at')::timestamptz,
        (item->>'deleted_at')::timestamptz);
  end loop;
  for item in select value from jsonb_array_elements(in_data->'quotes') loop
    insert into public.market_quote_cache(id,user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,
      instrument_type,price,market_at,market_date,fetched_at,market_state,delay_minutes,source_interval_minutes,source_name,
      refresh_outcome,created_at)
    values ((ids#>>array['quotes',item->>'id'])::uuid,in_user_id,item->>'provider',item->>'symbol',item->>'exchange',
      item->>'currency',item->>'timezone',item->>'listing_name',item->>'exchange_name',item->>'instrument_type',
      (item->>'price')::numeric,(item->>'market_at')::timestamptz,(item->>'market_date')::date,(item->>'fetched_at')::timestamptz,
      item->>'market_state',(item->>'delay_minutes')::numeric,(item->>'source_interval_minutes')::numeric,item->>'source_name',
      case when item->>'price' is null then 'never' else 'success' end,(item->>'created_at')::timestamptz);
  end loop;
  for item in select value from jsonb_array_elements(in_data->'targets') loop
    insert into public.market_listing_targets(id,user_id,provider,symbol,exchange,listing_name,exchange_name,instrument_type,
      cache_id,refresh_outcome)
    values ((ids#>>array['targets',item->>'id'])::uuid,in_user_id,item->>'provider',item->>'symbol',item->>'exchange',
      item->>'listing_name',item->>'exchange_name',item->>'instrument_type',(ids#>>array['quotes',item->>'cache_id'])::uuid,
      case when item->>'cache_id' is null then 'never' else 'success' end);
  end loop;
  for item in select value from jsonb_array_elements(in_data->'positions') loop
    new_id:=(ids#>>array['positions',item->>'id'])::uuid;
    new_wallet:=(ids#>>array['wallets',item->>'wallet_id'])::uuid;
    new_target:=(ids#>>array['targets',item->>'market_target_id'])::uuid;
    if new_id is null or new_wallet is null or new_target is null then
      raise exception 'Missing restored relationship' using errcode='23514';
    end if;
    insert into public.market_selection_receipts(user_id,wallet_id,target_id)
      values(in_user_id,new_wallet,new_target) returning id into receipt_id;
    position_state:=item || jsonb_build_object('market_target_id',new_target,
      'market_listing_id',ids#>>array['quotes',item->>'market_listing_id']);
    insert into portfolio_recovery.position_staging(transaction_id,user_id,position_id,state)
      values(txid_current(),in_user_id,new_id,position_state);
    insert into public.positions(id,user_id,instrument,buy_price,buy_date,quantity,broker_label,category_id,reason_text,
      created_at,deleted_at,wallet_id,current_price,price_date,sell_price,sell_date,opening_commission,closing_commission,
      market_selection_receipt_id)
    values(new_id,in_user_id,item->>'instrument',(item->>'buy_price')::numeric,(item->>'buy_date')::date,
      (item->>'quantity')::numeric,item->>'broker_label',(ids#>>array['categories',item->>'category_id'])::uuid,
      item->>'reason_text',(item->>'created_at')::timestamptz,(item->>'deleted_at')::timestamptz,new_wallet,
      (item->>'current_price')::numeric,(item->>'price_date')::date,(item->>'sell_price')::numeric,(item->>'sell_date')::date,
      (item->>'opening_commission')::numeric,(item->>'closing_commission')::numeric,receipt_id);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(in_data->'snapshots','[]'::jsonb)) loop
    insert into public.wallet_snapshots(wallet_id,user_id,observation_day,captured_at,starting_value,value,realised_change,
      open_change,realised_count,open_count,not_counted,as_of,currency,automatic_count,manual_count,oldest_market_at)
    values((ids#>>array['wallets',item->>'wallet_id'])::uuid,in_user_id,(item->>'observation_day')::date,
      (item->>'captured_at')::timestamptz,(item->>'starting_value')::numeric,(item->>'value')::numeric,
      (item->>'realised_change')::numeric,(item->>'open_change')::numeric,(item->>'realised_count')::integer,
      (item->>'open_count')::integer,(item->>'not_counted')::integer,(item->>'as_of')::date,item->>'currency',
      (item->>'automatic_count')::integer,(item->>'manual_count')::integer,(item->>'oldest_market_at')::timestamptz);
  end loop;
  if exists(select 1 from portfolio_recovery.position_staging where transaction_id=txid_current() and user_id=in_user_id) then
    raise exception 'Incomplete historical restoration' using errcode='23514';
  end if;
end $$;

create function portfolio_recovery.replace_state(in_user_id uuid,in_data jsonb,in_fingerprint text,in_operation_id uuid,
  in_kind text,in_request_hash text,in_snapshot_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='15s' as $$
declare previous jsonb; selected jsonb; saved portfolio_recovery.undo_copies; done portfolio_recovery.operations;
  result jsonb; new_snapshot_id uuid:=gen_random_uuid();
begin
  if in_user_id is null or in_operation_id is null or not exists(select 1 from auth.users where id=in_user_id) then
    raise exception 'Invalid recovery destination' using errcode='22023';
  end if;
  -- Fixed order serializes ordinary DML, snapshot cron and other restores. Reads remain available.
  lock table public.market_listing_lookups,public.market_listing_targets,public.market_quote_cache,
    public.market_selection_receipts,public.positions,public.reason_categories,public.wallet_snapshots,public.wallets,
    portfolio_recovery.undo_copies,portfolio_recovery.operations in share row exclusive mode;
  select * into done from portfolio_recovery.operations where user_id=in_user_id and operation_id=in_operation_id;
  if found then
    if done.kind is distinct from in_kind or done.request_hash is distinct from in_request_hash then
      raise exception 'Operation identity conflict' using errcode='22023';
    end if;
    return done.result;
  end if;
  previous:=portfolio_recovery.owner_state(in_user_id);
  if portfolio_recovery.fingerprint(previous) is distinct from in_fingerprint then
    raise exception 'Portfolio changed since preview' using errcode='40001';
  end if;
  if in_kind='undo' then
    select * into saved from portfolio_recovery.undo_copies where user_id=in_user_id;
    if not found or saved.snapshot_id is distinct from in_snapshot_id then
      raise exception 'Recovery copy changed since preview' using errcode='40001';
    end if;
    selected:=saved.data;
  else selected:=in_data; end if;
  -- Store before installing, in the same transaction. Any later error rolls this back too.
  insert into portfolio_recovery.undo_copies(user_id,snapshot_id,saved_at,data)
    values(in_user_id,new_snapshot_id,statement_timestamp(),previous)
    on conflict(user_id) do update set snapshot_id=excluded.snapshot_id,saved_at=excluded.saved_at,data=excluded.data;
  perform portfolio_recovery.install_state(in_user_id,selected);
  result:=jsonb_build_object('operation_id',in_operation_id,'undo_snapshot_id',new_snapshot_id,
    'counts',portfolio_recovery.state_counts(selected));
  insert into portfolio_recovery.operations(user_id,operation_id,kind,request_hash,result)
    values(in_user_id,in_operation_id,in_kind,in_request_hash,result);
  return result;
end $$;

create function public.portfolio_replace(in_user_id uuid,in_data jsonb,in_fingerprint text,in_operation_id uuid) returns jsonb
language sql security definer set search_path='' set lock_timeout='2s' set statement_timeout='15s' as $$
  select portfolio_recovery.replace_state(in_user_id,in_data,in_fingerprint,in_operation_id,'replace',
    portfolio_recovery.fingerprint(in_data));
$$;
create function public.portfolio_undo(in_user_id uuid,in_fingerprint text,in_operation_id uuid,in_snapshot_id uuid) returns jsonb
language sql security definer set search_path='' set lock_timeout='2s' set statement_timeout='15s' as $$
  select portfolio_recovery.replace_state(in_user_id,null,in_fingerprint,in_operation_id,'undo',in_snapshot_id::text,in_snapshot_id);
$$;

revoke all on all functions in schema portfolio_recovery from public,anon,authenticated;
revoke all on function public.portfolio_recovery_preview(uuid),public.portfolio_replace(uuid,jsonb,text,uuid),
  public.portfolio_undo(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.portfolio_recovery_preview(uuid),public.portfolio_replace(uuid,jsonb,text,uuid),
  public.portfolio_undo(uuid,text,uuid,uuid) to service_role;
