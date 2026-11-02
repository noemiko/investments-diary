-- Immutable selection receipts need SELECT only: FOR SHARE would require UPDATE privilege.
-- Keep receipt validation under the caller's RLS and recheck expiry at insertion.
create or replace function public.guard_position_selection() returns trigger
language plpgsql set search_path='' as $$
declare selection public.market_selection_receipts; target public.market_listing_targets;
begin
  if TG_OP='UPDATE' then
    if NEW.market_target_id is distinct from OLD.market_target_id or
      NEW.market_selection_receipt_id is distinct from OLD.market_selection_receipt_id then
      raise exception 'Saved stock selection is immutable' using errcode='23514';
    end if;
  elsif NEW.market_selection_receipt_id is not null then
    select * into selection from public.market_selection_receipts
      where id=NEW.market_selection_receipt_id and user_id=NEW.user_id
        and wallet_id=NEW.wallet_id and valid_until>statement_timestamp();
    if not found or not exists(select 1 from public.wallets w where w.id=NEW.wallet_id
      and w.user_id=NEW.user_id and w.deleted_at is null) then
      raise exception 'Choose a valid stock selection for this wallet' using errcode='23514';
    end if;
    select * into strict target from public.market_listing_targets where id=selection.target_id and user_id=NEW.user_id;
    NEW.market_target_id:=target.id;
    NEW.instrument:=target.symbol;
    NEW.market_listing_id:=null;
    NEW.listing_confirmed_at:=null;
  elsif NEW.market_target_id is not null then
    raise exception 'Stock selection requires a valid receipt' using errcode='23514';
  end if;
  return NEW;
end $$;
