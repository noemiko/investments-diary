-- FR-014/FR-015: additive quote storage and one price-selection contract.
-- No provider requests, historical currency guesses or historical save-time backfill.
alter table public.wallets
  add column currency text check (currency in ('USD','PLN','EUR')),
  add column currency_attested boolean not null default false,
  add column currency_confirmed_at timestamptz,
  add constraint wallets_currency_confirmation check (
    (currency is null and not currency_attested and currency_confirmed_at is null) or
    (currency is not null and currency_attested and currency_confirmed_at is not null)
  );

create function public.guard_wallet_currency() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.currency is null or not NEW.currency_attested then
      raise exception 'Choose and confirm the wallet currency' using errcode='23514';
    end if;
    NEW.currency_confirmed_at := statement_timestamp();
  elsif OLD.currency is not null then
    if NEW.currency is distinct from OLD.currency or
       NEW.currency_attested is distinct from OLD.currency_attested or
       NEW.currency_confirmed_at is distinct from OLD.currency_confirmed_at then
      raise exception 'Confirmed wallet currency is frozen' using errcode='23514';
    end if;
  elsif NEW.currency is not null then
    if not NEW.currency_attested then
      raise exception 'Confirm starting value and all recorded prices use this currency' using errcode='23514';
    end if;
    NEW.currency_confirmed_at := statement_timestamp();
  elsif NEW.currency_attested or NEW.currency_confirmed_at is not null then
    raise exception 'Currency confirmation requires a currency' using errcode='23514';
  end if;
  return NEW;
end $$;
create trigger wallets_guard_currency before insert or update on public.wallets
for each row execute function public.guard_wallet_currency();

create table public.market_quote_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider='yahoo'),
  symbol text not null check (symbol ~ '^[A-Z0-9^][A-Z0-9.^=/_-]{0,49}$'),
  exchange text not null check (exchange ~ '^[A-Z0-9]{1,20}$'),
  currency text not null check (currency in ('USD','PLN','EUR')),
  timezone text not null check (length(timezone) between 1 and 100),
  listing_name text not null check (length(listing_name) between 1 and 200),
  exchange_name text not null check (length(exchange_name) between 1 and 200),
  instrument_type text not null check (instrument_type in ('EQUITY','ETF')),
  price numeric(20,8) check (price > 0),
  market_at timestamptz,
  market_date date,
  fetched_at timestamptz,
  market_state text check (market_state in ('REGULAR','CLOSED','PRE','PREPRE','POST','POSTPOST')),
  delay_minutes numeric check (delay_minutes >= 0),
  source_interval_minutes numeric check (source_interval_minutes >= 0),
  source_name text check (length(source_name) <= 200),
  refresh_outcome text not null default 'never' check (refresh_outcome in
    ('never','success','not_found','invalid_quote','provider_unavailable','timeout','cancelled','older_quote')),
  attempted_at timestamptz,
  cooldown_until timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  unique(id,user_id),
  unique(user_id,provider,symbol,exchange,currency,timezone,instrument_type),
  check ((price is null and market_at is null and market_date is null and fetched_at is null and market_state is null) or
         (price is not null and market_at is not null and market_date is not null and fetched_at is not null and market_state is not null and market_at <= fetched_at)),
  check ((lease_token is null) = (lease_until is null))
);
alter table public.market_quote_cache enable row level security;
create policy market_quotes_select_own on public.market_quote_cache
  for select to authenticated using ((select auth.uid())=user_id);
create policy market_quotes_insert_own on public.market_quote_cache
  for insert to authenticated with check ((select auth.uid())=user_id);
create policy market_quotes_update_own on public.market_quote_cache
  for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
-- No hard-delete policy. Quote writes go through owner-checked RPCs, not arbitrary PATCHes.
revoke all on public.market_quote_cache from anon, authenticated;
grant select on public.market_quote_cache to authenticated;
grant insert (user_id,provider,symbol,exchange,currency,timezone,listing_name,exchange_name,instrument_type)
  on public.market_quote_cache to authenticated;

create function public.guard_quote_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=NEW.timezone) then
    raise exception 'Invalid exchange timezone' using errcode='23514';
  end if;
  if TG_OP='UPDATE' and (NEW.id,NEW.user_id,NEW.provider,NEW.symbol,NEW.exchange,NEW.currency,NEW.timezone,NEW.instrument_type)
    is distinct from (OLD.id,OLD.user_id,OLD.provider,OLD.symbol,OLD.exchange,OLD.currency,OLD.timezone,OLD.instrument_type) then
    raise exception 'Confirmed listing identity is immutable' using errcode='23514';
  end if;
  return NEW;
end $$;
create trigger market_quotes_guard_identity before insert or update on public.market_quote_cache
for each row execute function public.guard_quote_identity();

alter table public.positions
  add column market_listing_id uuid,
  add column listing_confirmed_at timestamptz,
  add column manual_price_saved_at timestamptz,
  add constraint positions_listing_owner_fkey foreign key(market_listing_id,user_id)
    references public.market_quote_cache(id,user_id),
  add constraint positions_listing_confirmation check ((market_listing_id is null) = (listing_confirmed_at is null));
create index positions_market_listing on public.positions(user_id,market_listing_id)
  where market_listing_id is not null and deleted_at is null;

create function public.guard_position_listing() returns trigger
language plpgsql set search_path = '' as $$
declare wallet_currency text; listing_currency text;
begin
  if NEW.market_listing_id is not null then
    select currency into wallet_currency from public.wallets where id=NEW.wallet_id and user_id=NEW.user_id;
    select currency into listing_currency from public.market_quote_cache where id=NEW.market_listing_id and user_id=NEW.user_id;
    if wallet_currency is null or listing_currency is null or wallet_currency <> listing_currency then
      raise exception 'Listing currency must match the confirmed wallet currency' using errcode='23514';
    end if;
    if TG_OP='INSERT' then NEW.listing_confirmed_at := statement_timestamp();
    elsif NEW.market_listing_id is distinct from OLD.market_listing_id then NEW.listing_confirmed_at := statement_timestamp();
    else NEW.listing_confirmed_at := OLD.listing_confirmed_at; end if;
  else NEW.listing_confirmed_at := null;
  end if;
  return NEW;
end $$;
create trigger positions_guard_listing before insert or update on public.positions
for each row execute function public.guard_position_listing();

create function public.guard_manual_save_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  if NEW.manual_price_saved_at is distinct from OLD.manual_price_saved_at then
    raise exception 'Manual save time is database stamped' using errcode='23514';
  end if;
  return NEW;
end $$;
create trigger positions_a_guard_manual_time before update on public.positions
for each row execute function public.guard_manual_save_time();
create function public.stamp_manual_price_save() returns trigger
language plpgsql set search_path = '' as $$
begin
  NEW.manual_price_saved_at := case when NEW.current_price is not null then statement_timestamp() else null end;
  return NEW;
end $$;
-- UPDATE OF detects explicit identical resubmissions; cache/link writes never invoke this trigger.
create trigger positions_z_stamp_manual_price before insert or update of current_price,price_date on public.positions
for each row execute function public.stamp_manual_price_save();

create function public.claim_market_quote_refresh(in_cache_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare token uuid := gen_random_uuid(); claimed uuid;
begin
  if auth.uid() is null then return null; end if;
  update public.market_quote_cache set lease_token=token,lease_until=statement_timestamp()+interval '30 seconds',
    attempted_at=statement_timestamp()
  where id=in_cache_id and user_id=auth.uid()
    and (lease_until is null or lease_until <= statement_timestamp())
    and (cooldown_until is null or cooldown_until <= statement_timestamp())
  returning lease_token into claimed;
  return claimed;
end $$;
revoke all on function public.claim_market_quote_refresh(uuid) from public,anon;
grant execute on function public.claim_market_quote_refresh(uuid) to authenticated;

create function public.finish_market_quote_refresh(
  in_cache_id uuid, in_token uuid, in_outcome text,
  in_price numeric default null, in_market_at timestamptz default null,
  in_market_date date default null, in_fetched_at timestamptz default null,
  in_market_state text default null, in_delay_minutes numeric default null,
  in_source_interval_minutes numeric default null, in_source_name text default null,
  in_retry_after timestamptz default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare cached public.market_quote_cache; accepted boolean := true;
begin
  if auth.uid() is null then return false; end if;
  select * into cached from public.market_quote_cache
    where id=in_cache_id and user_id=auth.uid() for update;
  if not found or in_token is null or cached.lease_token is distinct from in_token or
    cached.lease_until <= statement_timestamp() then return false; end if;
  if in_outcome='success' then
    if in_price is null or in_price <= 0 or in_price >= 1000000000000 or
      in_market_at is null or in_market_date is null or in_fetched_at is null or
      in_market_state is null or in_market_at > in_fetched_at or in_fetched_at > statement_timestamp() or
      in_market_date <> (in_market_at at time zone cached.timezone)::date then
      raise exception 'Invalid regular-session quote' using errcode='23514';
    end if;
    if cached.market_at is not null and in_market_at < cached.market_at then
      accepted := false;
      update public.market_quote_cache set refresh_outcome='older_quote',
        cooldown_until=statement_timestamp()+interval '15 minutes',lease_token=null,lease_until=null
        where id=cached.id;
    else
      update public.market_quote_cache set price=in_price,market_at=in_market_at,market_date=in_market_date,
        fetched_at=in_fetched_at,market_state=in_market_state,delay_minutes=in_delay_minutes,
        source_interval_minutes=in_source_interval_minutes,source_name=in_source_name,
        refresh_outcome='success',cooldown_until=null,lease_token=null,lease_until=null where id=cached.id;
    end if;
  elsif in_outcome in ('not_found','invalid_quote','provider_unavailable','timeout','cancelled') then
    -- Preserve every last-valid quote field on failure. Expiry alone never claims work.
    update public.market_quote_cache set refresh_outcome=in_outcome,
      cooldown_until=greatest(statement_timestamp()+interval '15 minutes',in_retry_after),
      lease_token=null,lease_until=null where id=cached.id;
  else raise exception 'Invalid refresh outcome' using errcode='23514';
  end if;
  return accepted;
end $$;
revoke all on function public.finish_market_quote_refresh(uuid,uuid,text,numeric,timestamptz,date,timestamptz,text,numeric,numeric,text,timestamptz) from public,anon;
grant execute on function public.finish_market_quote_refresh(uuid,uuid,text,numeric,timestamptz,date,timestamptz,text,numeric,numeric,text,timestamptz) to authenticated;

create view public.position_effective_prices with (security_invoker=true) as
select p.*,
  w.currency as wallet_currency,
  q.provider as quote_provider,q.symbol as quote_symbol,q.exchange as quote_exchange,
  q.currency as quote_currency,q.timezone as quote_timezone,q.listing_name,q.exchange_name,q.instrument_type,
  q.market_at as quote_market_at,q.market_date as quote_market_date,q.fetched_at as quote_fetched_at,
  q.refresh_outcome,q.cooldown_until,q.lease_until,q.market_state,q.delay_minutes,q.source_interval_minutes,q.source_name,
  case when p.sell_price is not null then p.sell_price
    when p.market_listing_id is not null and p.current_price is not null and p.manual_price_saved_at is not null
      and (q.market_at is null or q.market_at <= p.manual_price_saved_at) then p.current_price
    when q.price is not null then q.price
    else p.current_price end as selected_price,
  case when p.sell_price is not null then p.sell_date
    when p.market_listing_id is not null and p.current_price is not null and p.manual_price_saved_at is not null
      and (q.market_at is null or q.market_at <= p.manual_price_saved_at) then p.price_date
    when q.price is not null then q.market_date
    else p.price_date end as selected_date,
  case when p.sell_price is not null then p.sell_date::timestamp at time zone 'UTC'
    when p.market_listing_id is not null and p.current_price is not null and p.manual_price_saved_at is not null
      and (q.market_at is null or q.market_at <= p.manual_price_saved_at) then p.manual_price_saved_at
    when q.price is not null then q.market_at
    else p.manual_price_saved_at end as selected_at,
  case when p.sell_price is not null then 'sale'
    when p.market_listing_id is not null and p.current_price is not null and p.manual_price_saved_at is not null
      and (q.market_at is null or q.market_at <= p.manual_price_saved_at) then 'manual_override'
    when q.price is not null then 'automatic'
    when p.current_price is not null then 'manual'
    else 'missing' end as selected_source,
  case when p.market_listing_id is null then 'unlinked'
    when q.lease_until > statement_timestamp() then 'refreshing'
    when q.cooldown_until > statement_timestamp() then 'cooldown'
    else coalesce(q.refresh_outcome,'never') end as quote_state
from public.positions p
join public.wallets w on w.id=p.wallet_id and w.user_id=p.user_id
left join public.market_quote_cache q on q.id=p.market_listing_id and q.user_id=p.user_id;
grant select on public.position_effective_prices to authenticated;
