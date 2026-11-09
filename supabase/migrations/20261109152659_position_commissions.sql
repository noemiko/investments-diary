-- Flat transaction commissions (FR-004/FR-007/FR-012/FR-013).
-- Existing entries have no recorded fees; historical snapshots remain observations.
alter table public.positions
  add column opening_commission numeric(20,8) not null default 0,
  add column closing_commission numeric(20,8) not null default 0,
  add constraint positions_opening_commission_nonnegative check (opening_commission >= 0),
  add constraint positions_closing_commission_nonnegative check (closing_commission >= 0),
  add constraint positions_commission_quantity check (
    (opening_commission = 0 and closing_commission = 0) or quantity is not null
  ),
  add constraint positions_closing_commission_sale check (sell_price is not null or closing_commission = 0);

grant update(opening_commission, closing_commission) on public.positions to authenticated;

-- Preserve frozen view output order and append new facts explicitly.
do $$
declare definition text;
begin
  definition := regexp_replace(pg_get_viewdef('public.position_effective_prices'::regclass, true), ';\s*$', '');
  execute 'create or replace view public.position_effective_prices with (security_invoker=true) as
    select old.*, p.opening_commission, p.closing_commission
    from (' || definition || ') old join public.positions p on p.id=old.id and p.user_id=old.user_id';
end $$;

create or replace function public.capture_wallet_snapshots() returns bigint
language sql security definer set search_path = '' as $$
  with contributions as (
    select p.wallet_id,
      case when p.quantity is not null and p.sell_price is not null
        then (p.sell_price - p.buy_price) * p.quantity - p.opening_commission - p.closing_commission end as realised,
      case when p.quantity is not null and p.sell_price is null and p.selected_price is not null
        then (p.selected_price - p.buy_price) * p.quantity - p.opening_commission
        when p.sell_price is null then -p.opening_commission end as open_gain,
      (p.quantity is not null and p.sell_price is null and p.selected_price is not null) as open_valued,
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
      count(*) filter(where c.open_valued)::integer as open_count,
      (count(c.wallet_id)-count(c.realised)-count(*) filter(where c.open_valued))::integer as not_counted,
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

