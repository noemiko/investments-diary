-- Wallet creation already ran locally; preserve that migration and tighten its contract here.
-- Wallet deletion is outside FR-013 v1, including direct authenticated API updates.
alter table public.wallets
    add constraint wallets_no_soft_delete check (deleted_at is null);
