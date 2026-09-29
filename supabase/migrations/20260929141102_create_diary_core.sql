-- Creates the diary core: per-user reason categories (FR-005) and positions (FR-003, FR-004),
-- both owner-only under RLS, so S-01 can store entries and later slices can extend them.
--
-- Reason lock (FR-008): enforced in S-07. This migration adds no trigger for it, and no
-- application code gets an update path for `reason_text` until then.
-- Future buy dates are rejected in application code, not by a check constraint: a check on
-- `current_date` is not stable (Postgres assumes check constraints are immutable, and
-- `current_date` changes daily, so the constraint would mean different things over time).
-- Soft delete only (FR-009): both tables carry `deleted_at` and neither has a delete policy,
-- so authenticated clients cannot hard-delete rows.

create table if not exists public.reason_categories (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null
                check (name = btrim(name) and char_length(name) between 1 and 60),
    created_at  timestamptz not null default now(),
    deleted_at  timestamptz,           -- soft delete; see FR-009 and PRD Open Question 2
    -- target of the composite FK from positions: a position can only use its owner's category
    unique (id, user_id)
);

create unique index if not exists reason_categories_user_name_active_key
    on public.reason_categories (user_id, lower(name))
    where deleted_at is null;

create table if not exists public.positions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    instrument    text not null
                  check (instrument = btrim(instrument) and char_length(instrument) between 1 and 100),
    buy_price     numeric(20,8) not null check (buy_price > 0),   -- per share
    buy_date      date not null,
    quantity      numeric(20,8) check (quantity > 0),
    broker_label  text check (char_length(broker_label) <= 60),
    category_id   uuid not null,
    reason_text   text check (char_length(reason_text) <= 10000),
    created_at    timestamptz not null default now(),
    deleted_at    timestamptz,         -- soft delete; see FR-009
    foreign key (category_id, user_id)
        references public.reason_categories (id, user_id)
);

create index if not exists positions_user_buy_date_idx
    on public.positions (user_id, buy_date desc);

alter table public.reason_categories enable row level security;
alter table public.positions enable row level security;

create policy "reason_categories_select_own" on public.reason_categories
    for select to authenticated using (auth.uid() = user_id);

create policy "reason_categories_insert_own" on public.reason_categories
    for insert to authenticated with check (auth.uid() = user_id);

create policy "reason_categories_update_own" on public.reason_categories
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "positions_select_own" on public.positions
    for select to authenticated using (auth.uid() = user_id);

create policy "positions_insert_own" on public.positions
    for insert to authenticated with check (auth.uid() = user_id);

create policy "positions_update_own" on public.positions
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy on either table: removal is a soft delete via `deleted_at` (FR-009).
-- anon gets no policy at all: no policy means no access under RLS.
