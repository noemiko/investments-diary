-- Rollback for 20261015094649_add_position_current_price.sql.
--
-- WARNING: this DISCARDS every entered current price and price date (for every position, for every
-- user). Once real prices exist, write a forward migration instead. Kept outside
-- supabase/migrations/ so the CLI never applies it.
--
-- The unnamed `current_price > 0` check is dropped together with its column.

alter table public.positions
    drop constraint if exists positions_price_date_check,
    drop constraint if exists positions_price_pair_check;

alter table public.positions
    drop column if exists price_date,
    drop column if exists current_price;
