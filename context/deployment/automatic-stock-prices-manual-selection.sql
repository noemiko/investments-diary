-- OPERATOR TEMPLATE ONLY. Not part of the forward migration chain.
-- Copy into a newly reviewed additive migration only when manual valuation recovery is needed.
-- It changes selection for reads/future captures, never stored prices, targets or observations.
do $$
declare
  definition text;
  projection text;
begin
  if (select count(*) from pg_catalog.pg_attribute
      where attrelid='public.position_effective_prices'::regclass and not attisdropped
        and attname in ('selected_price','selected_date','selected_at','selected_source')) <> 4 then
    raise exception 'Expected the compatible effective-price view';
  end if;
  definition:=regexp_replace(pg_get_viewdef('public.position_effective_prices'::regclass,true),';\s*$','');
  select string_agg(
    case when a.attname in ('selected_price','selected_date','selected_at','selected_source') then
      format('(%s)::%s as %I',
        case a.attname
          when 'selected_price' then 'case when p.sell_price is not null then p.sell_price else p.current_price end'
          when 'selected_date' then 'case when p.sell_price is not null then p.sell_date else p.price_date end'
          when 'selected_at' then 'case when p.sell_price is not null then p.sell_date::timestamp at time zone ''UTC'' else p.manual_price_saved_at end'
          when 'selected_source' then 'case when p.sell_price is not null then ''sale'' when p.current_price is not null then ''manual'' else ''missing'' end'
        end,
        pg_catalog.format_type(a.atttypid,a.atttypmod),a.attname)
    else format('old.%I',a.attname) end,
    ',' order by a.attnum)
  into projection
  from pg_catalog.pg_attribute a
  where a.attrelid='public.position_effective_prices'::regclass and a.attnum>0 and not a.attisdropped;
  execute 'create or replace view public.position_effective_prices with (security_invoker=true) as select '
    ||projection||' from ('||definition||') old join public.positions p on p.id=old.id and p.user_id=old.user_id';
end $$;

-- capture_wallet_snapshots() remains unchanged and consumes this same manual/sale view.
-- CREATE OR REPLACE preserves the existing view identity, column order/types and grants.
-- No cron, grant, table or historical-row mutation belongs in this template.
