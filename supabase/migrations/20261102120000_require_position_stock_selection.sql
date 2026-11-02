-- Every investment carries exactly one stock selection: its creation-time target.
-- Owner decision 2026-11-02: existing draft investments get Apple (yahoo AAPL/NMS/EQUITY) through
-- the same pending-selection path new investments use, so the first explicit Download prices
-- verifies currency/timezone. Holdings with a confirmed listing get a target matching that cached
-- identity instead. Nothing here writes instrument labels, prices, manual save times, wallets,
-- receipts, quote cache rows or observations; market_listing_id stays nullable and is set only by
-- a verified download. Additive rollback, if ever needed: `drop not null` in a new migration.
-- Unguarded on purpose: ALTER ... SET NOT NULL and trigger toggles have no `if not exists` form.

-- Confirmed listings: one target per owned cache identity, pointing at the confirmed cache row.
-- An existing target keeps its cache link; only a missing one is filled in.
insert into public.market_listing_targets
  (user_id,provider,symbol,exchange,listing_name,exchange_name,instrument_type,cache_id)
select distinct on (q.user_id,q.provider,q.symbol,q.exchange,q.instrument_type)
  q.user_id,q.provider,q.symbol,q.exchange,q.listing_name,q.exchange_name,q.instrument_type,q.id
from public.positions p
join public.market_quote_cache q on q.id=p.market_listing_id and q.user_id=p.user_id
where p.market_target_id is null
order by q.user_id,q.provider,q.symbol,q.exchange,q.instrument_type,q.fetched_at desc nulls last,q.id
on conflict (user_id,provider,symbol,exchange,instrument_type)
  do update set cache_id=coalesce(public.market_listing_targets.cache_id,excluded.cache_id);

-- Every account that owns positions gets (or reuses) its Apple target.
insert into public.market_listing_targets
  (user_id,provider,symbol,exchange,listing_name,exchange_name,instrument_type)
select distinct p.user_id,'yahoo','AAPL','NMS','Apple Inc.','NasdaqGS','EQUITY'
from public.positions p
on conflict (user_id,provider,symbol,exchange,instrument_type) do nothing;

-- The guard forbids changing a saved selection; bypass it only for this backfill.
-- guard_position_selection() itself is unchanged, so no permanent bypass exists.
alter table public.positions disable trigger positions_guard_selection;

update public.positions p set market_target_id=t.id
from public.market_quote_cache q, public.market_listing_targets t
where p.market_target_id is null
  and q.id=p.market_listing_id and q.user_id=p.user_id
  and t.user_id=p.user_id
  and (t.provider,t.symbol,t.exchange,t.instrument_type)=(q.provider,q.symbol,q.exchange,q.instrument_type);

-- Open, closed, deleted and every wallet currency alike.
update public.positions p set market_target_id=t.id
from public.market_listing_targets t
where p.market_target_id is null and p.market_listing_id is null
  and t.user_id=p.user_id
  and (t.provider,t.symbol,t.exchange,t.instrument_type)=('yahoo','AAPL','NMS','EQUITY');

alter table public.positions enable trigger positions_guard_selection;

alter table public.positions alter column market_target_id set not null;
