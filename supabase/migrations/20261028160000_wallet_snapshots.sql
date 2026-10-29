-- FR-013: immutable observations, not reconstructed market history.
create table public.wallet_snapshots (
  wallet_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  observation_day date not null,
  captured_at timestamptz not null default statement_timestamp(),
  starting_value numeric not null,
  value numeric not null,
  realised_change numeric not null,
  open_change numeric not null,
  realised_count integer not null check (realised_count >= 0),
  open_count integer not null check (open_count >= 0),
  not_counted integer not null check (not_counted >= 0),
  as_of date,
  primary key (wallet_id, observation_day),
  foreign key (wallet_id, user_id) references public.wallets(id, user_id) on delete cascade,
  check (observation_day = (captured_at at time zone 'UTC')::date),
  check (value = starting_value + realised_change + open_change),
  check (starting_value >= 0),
  check ((open_count = 0) = (as_of is null))
);
create index wallet_snapshots_owner_day on public.wallet_snapshots(user_id, wallet_id, observation_day);
alter table public.wallet_snapshots enable row level security;
create policy snapshots_select_own on public.wallet_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
-- No client write policies. Cron is the only ordinary capture writer.
grant select on public.wallet_snapshots to authenticated;
revoke insert, update, delete on public.wallet_snapshots from anon, authenticated;

create function public.capture_wallet_snapshots() returns bigint
language sql security definer set search_path = '' as $$
  with contributions as (
    select p.wallet_id,
      case when p.quantity is not null and p.sell_price is not null
        then (p.sell_price - p.buy_price) * p.quantity end as realised,
      case when p.quantity is not null and p.sell_price is null and p.current_price is not null
        then (p.current_price - p.buy_price) * p.quantity end as open_gain,
      case when p.quantity is not null and p.sell_price is null and p.current_price is not null
        then p.price_date end as quote_date
    from public.positions p where p.deleted_at is null
  ), totals as (
    select w.id, w.user_id, w.starting_value,
      coalesce(sum(c.realised),0) as realised_change,
      coalesce(sum(c.open_gain),0) as open_change,
      count(c.realised)::integer as realised_count,
      count(c.open_gain)::integer as open_count,
      (count(c.wallet_id) - count(c.realised) - count(c.open_gain))::integer as not_counted,
      min(c.quote_date) as as_of
    from public.wallets w left join contributions c on c.wallet_id=w.id
    where w.deleted_at is null group by w.id
  ), inserted as (
    insert into public.wallet_snapshots
      (wallet_id,user_id,observation_day,captured_at,starting_value,value,realised_change,open_change,
       realised_count,open_count,not_counted,as_of)
    select id,user_id,(statement_timestamp() at time zone 'UTC')::date,statement_timestamp(),
      starting_value, starting_value+realised_change+open_change,realised_change,open_change,
      realised_count,open_count,not_counted,as_of from totals
    on conflict (wallet_id,observation_day) do nothing returning 1
  ) select count(*) from inserted;
$$;
revoke all on function public.capture_wallet_snapshots() from public, anon, authenticated;
grant execute on function public.capture_wallet_snapshots() to service_role;
-- Scheduling is activated separately on production, after storage/capture verification.
-- Local installations can run scripts/automation/configure-wallet-cron.mjs.
