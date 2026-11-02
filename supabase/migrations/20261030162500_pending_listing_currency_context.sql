-- A shared target can resolve for USD holdings while remaining pending in a PLN wallet.
-- This denomination is established by a verified quote, never inferred from search.
do $$
declare definition text;
begin
  definition:=regexp_replace(pg_get_viewdef('public.position_effective_prices'::regclass,true),';\s*$','');
  execute 'create or replace view public.position_effective_prices with (security_invoker=true) as
    select old.*,q.currency as pending_currency
    from ('||definition||') old
    left join public.market_listing_targets t on t.id=old.market_target_id and t.user_id=old.user_id
    left join public.market_quote_cache q on q.id=t.cache_id and q.user_id=t.user_id';
end $$;
