-- A single stable statement observes a consistent owner-scoped portfolio, independent of REST row caps.
-- Read-only: neither downloads quotes nor grants any new direct write permission.
create function public.portfolio_export_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with exported_positions as materialized (
    select p.* from public.position_effective_prices p
    where p.user_id = auth.uid() and p.deleted_at is null
  ), exported_targets as materialized (
    select t.* from public.market_listing_targets t
    where t.user_id = auth.uid() and exists
      (select 1 from exported_positions p where p.market_target_id = t.id)
  ), exported_quotes as materialized (
    select q.* from public.market_quote_cache q
    where q.user_id = auth.uid() and (
      exists (select 1 from exported_positions p where p.market_listing_id = q.id) or
      exists (select 1 from exported_targets t where t.cache_id = q.id)
    )
  )
  select jsonb_build_object(
    'wallets', coalesce((select jsonb_agg(to_jsonb(w) order by w.id) from (
      select id, name, starting_value::text, currency, created_at from public.wallets
      where user_id = auth.uid() and deleted_at is null
    ) w), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (
      select c.id,c.name,c.created_at,c.deleted_at from public.reason_categories c
      where c.user_id = auth.uid() and exists
        (select 1 from exported_positions p where p.category_id = c.id)
    ) c), '[]'::jsonb),
    'positions', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (
      select id,wallet_id,category_id,instrument,buy_date,buy_price::text,opening_commission::text,
        closing_commission::text,quantity::text,broker_label,reason_text,created_at,current_price::text,
        price_date,manual_price_saved_at,sell_price::text,sell_date,market_target_id,market_listing_id,
        listing_confirmed_at,selected_price::text,selected_date,selected_at,selected_source
      from exported_positions
    ) p), '[]'::jsonb),
    'targets', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (
      select id,provider,symbol,exchange,listing_name,exchange_name,instrument_type,cache_id
      from exported_targets
    ) t), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from (
      select id,provider,symbol,exchange,listing_name,exchange_name,instrument_type,currency,timezone,
        price::text,market_at,market_date,fetched_at,market_state,delay_minutes::text,
        source_interval_minutes::text,source_name,created_at
      from exported_quotes
    ) q), '[]'::jsonb)
  );
$$;
revoke all on function public.portfolio_export_snapshot() from public,anon;
grant execute on function public.portfolio_export_snapshot() to authenticated;
