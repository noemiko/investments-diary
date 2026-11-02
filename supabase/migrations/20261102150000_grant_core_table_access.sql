-- Hosted default privileges give anon/authenticated no select/insert/update/delete on tables created
-- by `postgres` (production default ACL checked 2026-11-02: anon/authenticated = Dxtm only). These three
-- tables relied on the permissive local default and never granted access explicitly, so signed-in users
-- got 42501 in production (loadWallets on /dashboard/wallets). Grant exactly what their RLS policies
-- allow; RLS still limits every row to its owner. No DELETE (no delete policies) and nothing for anon.
-- positions keeps its column-limited UPDATE from 20261030122155/20261102140000.
grant select, insert, update on public.wallets to authenticated;
grant select, insert, update on public.reason_categories to authenticated;
grant select, insert on public.positions to authenticated;
