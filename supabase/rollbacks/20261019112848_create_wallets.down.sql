-- Rollback for 20261019112848_create_wallets.sql.
--
-- WARNING: this DISCARDS every wallet (names and starting values) and every position's wallet
-- assignment, for every user. Positions themselves are kept. Once real wallets exist, write a
-- forward migration instead. Kept outside supabase/migrations/ so the CLI never applies it.
--
-- The wallets table's policies and index are dropped together with the table.

drop index if exists public.positions_user_wallet_idx;

alter table public.positions
    drop constraint if exists positions_wallet_fkey;

alter table public.positions
    drop column if exists wallet_id;

drop table if exists public.wallets;
