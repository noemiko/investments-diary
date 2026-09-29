-- Rollback for 20260929141102_create_diary_core.sql.
--
-- WARNING: this DESTROYS every diary row (all positions and reason categories, for every user).
-- It is for rolling back before real data exists only. Once the diary holds entries, write a
-- forward migration instead. Kept outside supabase/migrations/ so the CLI never applies it.
--
-- Policies and indexes are dropped together with their tables.

drop table if exists public.positions;
drop table if exists public.reason_categories;
