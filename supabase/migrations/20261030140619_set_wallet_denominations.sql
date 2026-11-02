-- User-approved denomination revision: previously unspecified wallets become USD.
-- Existing monetary values, timestamps and historical source coverage are unchanged.
drop trigger wallets_guard_currency on public.wallets;
drop function public.guard_wallet_currency();
alter table public.wallets drop constraint wallets_currency_confirmation;
update public.wallets set currency='USD' where currency is null;
alter table public.wallets
  alter column currency set default 'USD',
  alter column currency set not null,
  drop column currency_attested,
  drop column currency_confirmed_at;

create function public.guard_wallet_currency() returns trigger
language plpgsql set search_path='' as $$
begin
  if NEW.currency is distinct from OLD.currency then
    raise exception 'Wallet currency cannot be changed' using errcode='23514';
  end if;
  return NEW;
end $$;
create trigger wallets_guard_currency before update of currency on public.wallets
for each row execute function public.guard_wallet_currency();

-- Old observations inherit their own wallet's denomination, without changing amounts/dates.
update public.wallet_snapshots s set currency=w.currency
from public.wallets w where s.wallet_id=w.id and s.user_id=w.user_id and s.currency is null;
alter table public.wallet_snapshots alter column currency set not null;

-- Retire the attestation argument; ownership, stable locks and currency checks remain.
drop function public.move_position_to_wallet(uuid,uuid,boolean);
create function public.move_position_to_wallet(in_position_id uuid,in_wallet_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare position public.positions; source_currency text; target_currency text;
begin
  if auth.uid() is null then return 'not_found'; end if;
  select * into position from public.positions
    where id=in_position_id and user_id=auth.uid() and deleted_at is null for update;
  if not found then return 'not_found'; end if;
  -- A deterministic lock order avoids opposite-direction moves deadlocking.
  perform id from public.wallets where id in (position.wallet_id,in_wallet_id) and user_id=auth.uid() order by id for update;
  select currency into source_currency from public.wallets
    where id=position.wallet_id and user_id=auth.uid() and deleted_at is null;
  if not found then return 'not_found'; end if;
  select currency into target_currency from public.wallets
    where id=in_wallet_id and user_id=auth.uid() and deleted_at is null;
  if not found then return 'not_found'; end if;
  if source_currency <> target_currency then return 'incompatible_currency'; end if;
  update public.positions set wallet_id=in_wallet_id where id=position.id;
  return 'success';
end $$;
revoke all on function public.move_position_to_wallet(uuid,uuid) from public,anon;
grant execute on function public.move_position_to_wallet(uuid,uuid) to authenticated;

create or replace function public.claim_listing_lookup(in_lookup_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid(); result uuid;
begin
  update public.market_listing_lookups l set lease_token=token,lease_until=statement_timestamp()+interval '30 seconds'
  where l.id=in_lookup_id and l.user_id=auth.uid()
    and (l.lease_until is null or l.lease_until<=statement_timestamp())
    and (l.cooldown_until is null or l.cooldown_until<=statement_timestamp())
    and exists(select 1 from public.positions p join public.wallets w on w.id=p.wallet_id and w.user_id=p.user_id
      where p.id=l.position_id and p.user_id=auth.uid() and p.deleted_at is null
        and p.sell_price is null and p.sell_date is null and w.deleted_at is null)
  returning l.lease_token into result;
  return result;
end $$;
revoke all on function public.claim_listing_lookup(uuid) from public,anon;
grant execute on function public.claim_listing_lookup(uuid) to authenticated;
