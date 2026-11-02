-- Search proves a selectable identity, not a denomination or a quote.
create table public.market_listing_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider='yahoo'),
  symbol text not null check (symbol ~ '^[A-Z0-9][A-Z0-9.^=-]{0,49}$'),
  exchange text not null check (exchange ~ '^[A-Z0-9]{1,20}$'),
  listing_name text not null check (length(listing_name) between 1 and 200),
  exchange_name text not null check (length(exchange_name) between 1 and 200),
  instrument_type text not null check (instrument_type in ('EQUITY','ETF')),
  cache_id uuid,
  refresh_outcome text not null default 'never' check (refresh_outcome in
    ('never','success','not_found','invalid_quote','provider_unavailable','timeout','cancelled','older_quote')),
  cooldown_until timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  unique(id,user_id),
  unique(user_id,provider,symbol,exchange,instrument_type),
  foreign key(cache_id,user_id) references public.market_quote_cache(id,user_id),
  check ((lease_token is null)=(lease_until is null))
);
create table public.market_selection_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null,
  target_id uuid not null,
  valid_until timestamptz not null default statement_timestamp()+interval '30 minutes',
  unique(id,user_id),
  foreign key(wallet_id,user_id) references public.wallets(id,user_id),
  foreign key(target_id,user_id) references public.market_listing_targets(id,user_id)
);
alter table public.market_listing_targets enable row level security;
alter table public.market_selection_receipts enable row level security;
create policy market_targets_select_own on public.market_listing_targets for select to authenticated
  using ((select auth.uid())=user_id);
create policy market_targets_insert_own on public.market_listing_targets for insert to authenticated
  with check ((select auth.uid())=user_id);
create policy market_selections_select_own on public.market_selection_receipts for select to authenticated
  using ((select auth.uid())=user_id);
create policy market_selections_insert_own on public.market_selection_receipts for insert to authenticated
  with check ((select auth.uid())=user_id and exists
    (select 1 from public.wallets w where w.id=wallet_id and w.user_id=(select auth.uid()) and w.deleted_at is null));
revoke all on public.market_listing_targets,public.market_selection_receipts from anon,authenticated;
grant select on public.market_listing_targets,public.market_selection_receipts to authenticated;
grant insert(user_id,provider,symbol,exchange,listing_name,exchange_name,instrument_type)
  on public.market_listing_targets to authenticated;
grant insert(user_id,wallet_id,target_id) on public.market_selection_receipts to authenticated;

alter table public.positions
  add column market_target_id uuid,
  add column market_selection_receipt_id uuid,
  add constraint positions_target_owner_fkey foreign key(market_target_id,user_id)
    references public.market_listing_targets(id,user_id),
  add constraint positions_selection_owner_fkey foreign key(market_selection_receipt_id,user_id)
    references public.market_selection_receipts(id,user_id);
create index positions_pending_target on public.positions(user_id,market_target_id)
  where market_target_id is not null and market_listing_id is null and deleted_at is null;

create function public.guard_position_selection() returns trigger
language plpgsql set search_path='' as $$
declare selection public.market_selection_receipts; target public.market_listing_targets;
begin
  if TG_OP='UPDATE' then
    if NEW.market_target_id is distinct from OLD.market_target_id or
      NEW.market_selection_receipt_id is distinct from OLD.market_selection_receipt_id then
      raise exception 'Saved stock selection is immutable' using errcode='23514';
    end if;
  elsif NEW.market_selection_receipt_id is not null then
    select * into selection from public.market_selection_receipts
      where id=NEW.market_selection_receipt_id and user_id=NEW.user_id
        and wallet_id=NEW.wallet_id and valid_until>statement_timestamp() for share;
    if not found or not exists(select 1 from public.wallets w where w.id=NEW.wallet_id
      and w.user_id=NEW.user_id and w.deleted_at is null) then
      raise exception 'Choose a valid stock selection for this wallet' using errcode='23514';
    end if;
    select * into strict target from public.market_listing_targets where id=selection.target_id and user_id=NEW.user_id;
    NEW.market_target_id:=target.id;
    NEW.instrument:=target.symbol;
    NEW.market_listing_id:=null;
    NEW.listing_confirmed_at:=null;
  elsif NEW.market_target_id is not null then
    raise exception 'Stock selection requires a valid receipt' using errcode='23514';
  end if;
  return NEW;
end $$;
create trigger positions_guard_selection before insert or update on public.positions
  for each row execute function public.guard_position_selection();

create function public.claim_market_target(in_target_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid(); result uuid;
begin
  update public.market_listing_targets t set lease_token=token,lease_until=statement_timestamp()+interval '30 seconds'
    where t.id=in_target_id and t.user_id=auth.uid()
      and (t.lease_until is null or t.lease_until<=statement_timestamp())
      and (t.cooldown_until is null or t.cooldown_until<=statement_timestamp())
      and exists(select 1 from public.positions p join public.wallets w on w.id=p.wallet_id and w.user_id=p.user_id
        where p.market_target_id=t.id and p.user_id=auth.uid() and p.market_listing_id is null
          and p.deleted_at is null and p.sell_price is null and p.sell_date is null and w.deleted_at is null)
    returning t.lease_token into result;
  return result;
end $$;
create function public.finish_market_target(in_target_id uuid,in_token uuid,in_outcome text,
  in_cache_id uuid default null,in_retry_after timestamptz default null,in_release boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare target public.market_listing_targets; mismatches integer:=0;
begin
  select * into target from public.market_listing_targets where id=in_target_id and user_id=auth.uid() for update;
  if not found or in_token is null or target.lease_token is distinct from in_token
    or target.lease_until<=statement_timestamp() then return -1; end if;
  if in_release then
    update public.market_listing_targets set lease_token=null,lease_until=null where id=target.id;
    return 0;
  end if;
  if in_outcome='success' then
    if not exists(select 1 from public.market_quote_cache q where q.id=in_cache_id and q.user_id=auth.uid()
      and (q.provider,q.symbol,q.exchange,q.instrument_type)=(target.provider,target.symbol,target.exchange,target.instrument_type)
      and q.price is not null) then raise exception 'Invalid target quote' using errcode='23514'; end if;
    -- Recheck ownership/state/currency in the write, including concurrently moved holdings.
    update public.positions p set market_listing_id=in_cache_id
      from public.market_quote_cache q,public.wallets w
      where q.id=in_cache_id and q.user_id=auth.uid() and p.market_target_id=target.id
        and p.user_id=auth.uid() and p.market_listing_id is null and p.deleted_at is null
        and p.sell_price is null and p.sell_date is null and w.id=p.wallet_id and w.user_id=p.user_id
        and w.deleted_at is null and w.currency=q.currency;
    select count(*) into mismatches from public.positions p join public.wallets w on w.id=p.wallet_id and w.user_id=p.user_id
      join public.market_quote_cache q on q.id=in_cache_id and q.user_id=p.user_id
      where p.market_target_id=target.id and p.user_id=auth.uid() and p.market_listing_id is null
        and p.deleted_at is null and p.sell_price is null and p.sell_date is null and w.deleted_at is null
        and w.currency<>q.currency;
    update public.market_listing_targets set cache_id=in_cache_id,refresh_outcome='success',cooldown_until=null,
      lease_token=null,lease_until=null where id=target.id;
  elsif in_outcome in ('not_found','invalid_quote','provider_unavailable','timeout','cancelled','older_quote') then
    update public.market_listing_targets set refresh_outcome=in_outcome,
      cooldown_until=greatest(statement_timestamp()+interval '15 minutes',in_retry_after),
      lease_token=null,lease_until=null where id=target.id;
  else raise exception 'Invalid target outcome' using errcode='23514'; end if;
  return mismatches;
end $$;
revoke all on function public.claim_market_target(uuid),
  public.finish_market_target(uuid,uuid,text,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.claim_market_target(uuid),
  public.finish_market_target(uuid,uuid,text,uuid,timestamptz,boolean) to authenticated;

-- Retain every existing output column in its current order, append pending context.
do $$
declare definition text;
begin
  definition:=regexp_replace(pg_get_viewdef('public.position_effective_prices'::regclass,true),';\s*$','');
  execute 'create or replace view public.position_effective_prices with (security_invoker=true) as
    select old.*,p.market_target_id,t.symbol as pending_symbol,t.listing_name as pending_name,
      t.exchange as pending_exchange,t.exchange_name as pending_exchange_name,t.instrument_type as pending_instrument_type,
      t.refresh_outcome as pending_outcome,t.cooldown_until as pending_cooldown_until,t.lease_until as pending_lease_until
    from ('||definition||') old join public.positions p on p.id=old.id
    left join public.market_listing_targets t on t.id=p.market_target_id and t.user_id=p.user_id';
end $$;
