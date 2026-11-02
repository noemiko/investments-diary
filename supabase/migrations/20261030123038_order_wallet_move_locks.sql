-- FR-016: lock both wallets in stable order for concurrent opposite-direction moves.
create or replace function public.move_position_to_wallet(in_position_id uuid,in_wallet_id uuid,in_attested boolean default false)
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
  if target_currency is null then return 'currency_required'; end if;
  if source_currency is not null and source_currency <> target_currency then return 'incompatible_currency'; end if;
  if source_currency is null and not coalesce(in_attested,false) then return 'attestation_required'; end if;
  update public.positions set wallet_id=in_wallet_id where id=position.id;
  return 'success';
end $$;
revoke all on function public.move_position_to_wallet(uuid,uuid,boolean) from public,anon;
grant execute on function public.move_position_to_wallet(uuid,uuid,boolean) to authenticated;
