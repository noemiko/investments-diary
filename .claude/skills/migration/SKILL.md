---
name: migration
description: Scaffold a new Supabase migration for this project with RLS enabled and per-operation policies stubbed. Usage: /migration <short_description>
disable-model-invocation: true
---

# New Supabase migration

Argument: `$ARGUMENTS` — a short snake_case description, e.g. `create_positions`.

`supabase/migrations/` does not exist in a fresh checkout. Create it if needed.

## 1. Resolve the filename

```bash
mkdir -p supabase/migrations
printf 'supabase/migrations/%s_%s.sql\n' "$(date -u +%Y%m%d%H%M%S)" "<description>"
```

Timestamp is **UTC**, format `YYYYMMDDHHmmss`. Supabase orders migrations lexically by this
prefix, so a local-time or reused timestamp silently changes apply order.

## 2. Write the migration

Every new table needs RLS. The diary is single-user, but @context/foundation/prd.md makes privacy
of financial reasoning a hard guardrail — an un-policied table is readable by any authenticated
role. Write **granular per-operation, per-role policies**, never one blanket `FOR ALL`.

Template:

```sql
-- <what this migration does and why, in one or two sentences>

create table if not exists public.<table> (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    -- domain columns here
    created_at  timestamptz not null default now(),
    deleted_at  timestamptz            -- soft delete; see FR-009
);

alter table public.<table> enable row level security;

create policy "<table>_select_own" on public.<table>
    for select to authenticated using (auth.uid() = user_id);

create policy "<table>_insert_own" on public.<table>
    for insert to authenticated with check (auth.uid() = user_id);

create policy "<table>_update_own" on public.<table>
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "<table>_delete_own" on public.<table>
    for delete to authenticated using (auth.uid() = user_id);

-- anon gets no policy at all: no policy means no access under RLS.
```

Project-specific rules, all traceable to the PRD:

- **Soft delete, not hard delete.** FR-009 requires a deleted entry to be recoverable. Prefer a
  `deleted_at timestamptz` column and filter it in queries over a destructive `delete`.
- **Reason text locks.** FR-008 makes the written reason read-only shortly after entry while
  factual fields stay editable. If this migration touches reason columns, either enforce that in
  the schema (trigger) or state explicitly in the migration comment that it is enforced in
  application code — do not leave it unstated.
- **Never `drop` or `alter ... drop column` on a table holding entries** without saying so
  plainly and getting confirmation first. The no-silent-data-loss guardrail applies to schema
  changes too.

## 3. Apply and verify locally

```bash
npx supabase start          # Docker, ~7 GB RAM, Studio on :54323
npx supabase migration up   # applies pending migrations to the local stack
```

Then confirm RLS actually took: in Studio, or via SQL, check that `relrowsecurity` is true and
the expected policies exist:

```sql
select relname, relrowsecurity from pg_class where relname = '<table>';
select policyname, cmd, roles from pg_policies where tablename = '<table>';
```

A migration that applies cleanly but leaves RLS off is the failure mode this skill exists to
prevent. Report the actual query output, not just "RLS enabled".
