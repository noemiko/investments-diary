-- Adds the current price of a position and the date that price belongs to (FR-006), so S-02 can
-- show a position's value against its buy price.
--
-- One price per position, by design: entering a new price overwrites the old one. No price history
-- is kept.
-- The pair is all-or-nothing: a price without its date (or a date without its price) is rejected.
-- A price date before the buy date is rejected. Future price dates are rejected in application
-- code, not by a check constraint, for the same reason as future buy dates in
-- 20260929141102_create_diary_core.sql: a check on `current_date` is not stable.
-- No new policy: the existing `positions_update_own` policy already covers writing these columns.

alter table public.positions
    add column if not exists current_price numeric(20,8) check (current_price > 0),   -- per share
    add column if not exists price_date    date;

alter table public.positions
    add constraint positions_price_pair_check
        check ((current_price is null) = (price_date is null)),
    add constraint positions_price_date_check
        check (price_date >= buy_date);
