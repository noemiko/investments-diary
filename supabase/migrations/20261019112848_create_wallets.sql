-- Adds wallets (FR-013): named groupings of an author's positions, each with a starting value, and
-- makes every position belong to exactly one wallet of the same author.
--
-- A wallet's value (starting value + Σ result of its positions) is computed in application code
-- (src/lib/wallet.ts) from the existing per-position result, not stored here.
-- No delete in the first version (PRD Open Question 6): `deleted_at` is reserved and there is no
-- delete policy, as for the other diary tables.
-- Backfill: every author who already has positions (deleted ones included) gets one wallet named
-- 'Main' with starting value 0, and all their positions move into it. Authors without positions
-- get no wallet; the new-investment form asks them to create one first.

create table if not exists public.wallets (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    name            text not null
                    check (name = btrim(name) and char_length(name) between 1 and 60),
    starting_value  numeric(20,8) not null check (starting_value >= 0),
    created_at      timestamptz not null default now(),
    deleted_at      timestamptz,       -- reserved; no delete in the first version
    -- target of the composite FK from positions: a position can only use its owner's wallet
    unique (id, user_id)
);

create unique index if not exists wallets_user_name_active_key
    on public.wallets (user_id, lower(name))
    where deleted_at is null;

alter table public.wallets enable row level security;

create policy "wallets_select_own" on public.wallets
    for select to authenticated using (auth.uid() = user_id);

create policy "wallets_insert_own" on public.wallets
    for insert to authenticated with check (auth.uid() = user_id);

create policy "wallets_update_own" on public.wallets
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy: see header. anon gets no policy at all: no policy means no access under RLS.

-- Nullable until the backfill below has filled it.
alter table public.positions add column if not exists wallet_id uuid;

with main_wallets as (
    insert into public.wallets (user_id, name, starting_value)
    select distinct user_id, 'Main', 0 from public.positions where wallet_id is null
    returning id, user_id
)
update public.positions p
    set wallet_id = w.id
    from main_wallets w
    where p.user_id = w.user_id and p.wallet_id is null;

alter table public.positions alter column wallet_id set not null;

-- Named explicitly: the service tells this FK violation apart from the category one by name.
alter table public.positions
    add constraint positions_wallet_fkey
        foreign key (wallet_id, user_id) references public.wallets (id, user_id);

create index if not exists positions_user_wallet_idx
    on public.positions (user_id, wallet_id)
    where deleted_at is null;
