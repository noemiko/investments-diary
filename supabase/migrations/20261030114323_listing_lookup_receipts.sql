-- FR-014: retain owner/position-bound validated lookup results across serverless requests.
-- Expiring receipts are not investment records; quote values stay in the existing cache.
create table public.market_listing_lookups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9][A-Z0-9.^=-]{0,49}$'),
  cache_id uuid,
  valid_until timestamptz,
  cooldown_until timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  unique(user_id,position_id,symbol),
  foreign key(cache_id,user_id) references public.market_quote_cache(id,user_id),
  check ((cache_id is null)=(valid_until is null)),
  check ((lease_token is null)=(lease_until is null))
);
alter table public.market_listing_lookups enable row level security;
create policy listing_lookups_select_own on public.market_listing_lookups for select to authenticated
  using ((select auth.uid())=user_id);
create policy listing_lookups_insert_own on public.market_listing_lookups for insert to authenticated
  with check ((select auth.uid())=user_id and exists
    (select 1 from public.positions p where p.id=position_id and p.user_id=(select auth.uid())));
create policy listing_lookups_update_own on public.market_listing_lookups for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.market_listing_lookups from anon,authenticated;
grant select on public.market_listing_lookups to authenticated;
grant insert(user_id,position_id,symbol) on public.market_listing_lookups to authenticated;

create function public.claim_listing_lookup(in_lookup_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid(); result uuid;
begin
  update public.market_listing_lookups l set lease_token=token,lease_until=statement_timestamp()+interval '30 seconds'
  where l.id=in_lookup_id and l.user_id=auth.uid()
    and (l.lease_until is null or l.lease_until<=statement_timestamp())
    and (l.cooldown_until is null or l.cooldown_until<=statement_timestamp())
    and exists(select 1 from public.positions p join public.wallets w on w.id=p.wallet_id and w.user_id=p.user_id
      where p.id=l.position_id and p.user_id=auth.uid() and p.deleted_at is null
        and p.sell_price is null and p.sell_date is null and w.currency is not null and w.deleted_at is null)
  returning l.lease_token into result;
  return result;
end $$;
revoke all on function public.claim_listing_lookup(uuid) from public,anon;
grant execute on function public.claim_listing_lookup(uuid) to authenticated;

create function public.finish_listing_lookup(in_lookup_id uuid,in_token uuid,in_cache_id uuid default null,
  in_retry_after timestamptz default null,in_release boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare receipt public.market_listing_lookups;
begin
  select * into receipt from public.market_listing_lookups where id=in_lookup_id and user_id=auth.uid() for update;
  if not found or in_token is null or receipt.lease_token is distinct from in_token or receipt.lease_until<=statement_timestamp() then return false; end if;
  if in_cache_id is not null then
    if not exists(select 1 from public.market_quote_cache q join public.positions p on p.id=receipt.position_id
      join public.wallets w on w.id=p.wallet_id and w.user_id=p.user_id
      where q.id=in_cache_id and q.user_id=auth.uid() and q.symbol=receipt.symbol
        and q.price is not null and q.currency=w.currency and p.user_id=auth.uid()
        and p.deleted_at is null and p.sell_price is null and w.deleted_at is null) then
      raise exception 'Lookup result does not match this position' using errcode='23514';
    end if;
    update public.market_listing_lookups set cache_id=in_cache_id,valid_until=statement_timestamp()+interval '30 minutes',
      cooldown_until=null,lease_token=null,lease_until=null where id=receipt.id;
  elsif in_release then
    update public.market_listing_lookups set lease_token=null,lease_until=null where id=receipt.id;
  else
    update public.market_listing_lookups set cooldown_until=greatest(statement_timestamp()+interval '15 minutes',in_retry_after),
      lease_token=null,lease_until=null where id=receipt.id;
  end if;
  return true;
end $$;
revoke all on function public.finish_listing_lookup(uuid,uuid,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.finish_listing_lookup(uuid,uuid,uuid,timestamptz,boolean) to authenticated;

create function public.confirm_listing_lookup(in_lookup_id uuid,in_position_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare linked uuid;
begin
  update public.positions p set market_listing_id=l.cache_id
  from public.market_listing_lookups l join public.market_quote_cache q on q.id=l.cache_id and q.user_id=l.user_id
  where l.id=in_lookup_id and l.position_id=in_position_id and p.id=l.position_id
    and l.user_id=auth.uid() and p.user_id=auth.uid() and l.valid_until>statement_timestamp()
    and q.symbol=l.symbol and q.price is not null and p.deleted_at is null and p.sell_price is null and p.sell_date is null
  returning p.id into linked;
  return linked is not null;
end $$;
revoke all on function public.confirm_listing_lookup(uuid,uuid) from public,anon;
grant execute on function public.confirm_listing_lookup(uuid,uuid) to authenticated;

-- Unattempted work must remain due if the shared provider budget expires after a claim.
create function public.release_market_quote_refresh(in_cache_id uuid,in_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare released uuid;
begin
  update public.market_quote_cache set lease_token=null,lease_until=null
    where id=in_cache_id and user_id=auth.uid() and in_token is not null and lease_token=in_token
    returning id into released;
  return released is not null;
end $$;
revoke all on function public.release_market_quote_refresh(uuid,uuid) from public,anon;
grant execute on function public.release_market_quote_refresh(uuid,uuid) to authenticated;
