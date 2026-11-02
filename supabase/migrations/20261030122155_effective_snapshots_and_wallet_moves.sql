-- FR-013/FR-016: preserve observations while future captures use cached effective prices.
-- Currency/source context is unknown for old observations; never infer or rewrite it.
alter table public.wallet_snapshots
  add column currency text check (currency in ('USD','PLN','EUR')),
  add column automatic_count integer check (automatic_count >= 0),
  add column manual_count integer check (manual_count >= 0),
  add column oldest_market_at timestamptz,
  add constraint snapshots_source_coverage check (
    (automatic_count is null and manual_count is null and oldest_market_at is null) or
    (automatic_count is not null and manual_count is not null and
      automatic_count + manual_count = open_count and
      ((automatic_count=0) = (oldest_market_at is null)))
  );

create or replace function public.capture_wallet_snapshots() returns bigint
language sql security definer set search_path = '' as $$
  with contributions as (
    select p.wallet_id,
      case when p.quantity is not null and p.sell_price is not null
        then (p.sell_price - p.buy_price) * p.quantity end as realised,
      case when p.quantity is not null and p.sell_price is null and p.selected_price is not null
        then (p.selected_price - p.buy_price) * p.quantity end as open_gain,
      case when p.quantity is not null and p.sell_price is null and p.selected_price is not null
        then p.selected_date end as quote_date,
      case when p.quantity is not null and p.sell_price is null and p.selected_price is not null
        then p.selected_source end as source,
      case when p.quantity is not null and p.sell_price is null and p.selected_source='automatic'
        then p.quote_market_at end as market_at
    from public.position_effective_prices p where p.deleted_at is null
  ), totals as (
    select w.id,w.user_id,w.starting_value,w.currency,
      coalesce(sum(c.realised),0) as realised_change,
      coalesce(sum(c.open_gain),0) as open_change,
      count(c.realised)::integer as realised_count,
      count(c.open_gain)::integer as open_count,
      (count(c.wallet_id)-count(c.realised)-count(c.open_gain))::integer as not_counted,
      min(c.quote_date) as as_of,
      count(*) filter(where c.source='automatic')::integer as automatic_count,
      count(*) filter(where c.source in ('manual','manual_override'))::integer as manual_count,
      min(c.market_at) as oldest_market_at
    from public.wallets w left join contributions c on c.wallet_id=w.id
    where w.deleted_at is null group by w.id
  ), inserted as (
    insert into public.wallet_snapshots
      (wallet_id,user_id,observation_day,captured_at,starting_value,value,realised_change,open_change,
       realised_count,open_count,not_counted,as_of,currency,automatic_count,manual_count,oldest_market_at)
    select id,user_id,(statement_timestamp() at time zone 'UTC')::date,statement_timestamp(),
      starting_value,starting_value+realised_change+open_change,realised_change,open_change,
      realised_count,open_count,not_counted,as_of,currency,automatic_count,manual_count,oldest_market_at
    from totals on conflict(wallet_id,observation_day) do nothing returning 1
  ) select count(*) from inserted;
$$;
revoke all on function public.capture_wallet_snapshots() from public,anon,authenticated;
grant execute on function public.capture_wallet_snapshots() to service_role;

-- All ordinary position writes keep their existing ownership RLS. Wallet reassignment
-- is exclusively the attestation-aware RPC; no direct PATCH may bypass its checks.
-- Reason locking remains in the existing application write policy (FR-008).
revoke update on public.positions from authenticated;
grant update(id,user_id,instrument,buy_price,buy_date,quantity,broker_label,category_id,
  reason_text,created_at,deleted_at,current_price,price_date,sell_price,sell_date,
  market_listing_id,listing_confirmed_at,manual_price_saved_at) on public.positions to authenticated;

create function public.move_position_to_wallet(in_position_id uuid,in_wallet_id uuid,in_attested boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare position public.positions; source_currency text; target_currency text;
begin
  if auth.uid() is null then return 'not_found'; end if;
  select * into position from public.positions
    where id=in_position_id and user_id=auth.uid() and deleted_at is null for update;
  if not found then return 'not_found'; end if;
  select currency into source_currency from public.wallets
    where id=position.wallet_id and user_id=auth.uid() and deleted_at is null for update;
  if not found then return 'not_found'; end if;
  select currency into target_currency from public.wallets
    where id=in_wallet_id and user_id=auth.uid() and deleted_at is null for update;
  if not found then return 'not_found'; end if;
  if target_currency is null then return 'currency_required'; end if;
  if source_currency is not null and source_currency <> target_currency then return 'incompatible_currency'; end if;
  if source_currency is null and not coalesce(in_attested,false) then return 'attestation_required'; end if;
  update public.positions set wallet_id=in_wallet_id where id=position.id;
  return 'success';
end $$;
revoke all on function public.move_position_to_wallet(uuid,uuid,boolean) from public,anon;
grant execute on function public.move_position_to_wallet(uuid,uuid,boolean) to authenticated;
