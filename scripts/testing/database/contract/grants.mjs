// Every RLS policy must be backed by an explicit grant. The local stack's permissive defaults hid three
// missing grants until production returned 42501 on 2026-11-02; the harness replays the chain without
// default privileges or fixture grants, so these catalogue checks see only what the chain itself grants.

// Intentionally ungranted: these tables revoke direct UPDATE and are written only through
// security-definer RPCs (claim/finish/release quote refresh, the retired listing lookups).
const ungranted = ["UPDATE market_quote_cache", "UPDATE market_listing_lookups"];

export default function grants(db) {
  // A policy for an operation is useless (42501) unless the role also holds that privilege.
  const missing = db.sql(`select coalesce(string_agg(format('%s %s', p.cmd, p.tablename), ', '
      order by p.tablename, p.cmd), '')
    from pg_policies p
    where p.schemaname = 'public' and p.roles && array['authenticated', 'public']::name[]
      and format('%s %s', p.cmd, p.tablename) <> all (array[${ungranted.map((u) => `'${u}'`).join(",")}])
      and not case p.cmd
        when 'SELECT' then has_any_column_privilege('authenticated', format('public.%I', p.tablename), 'select')
        when 'INSERT' then has_any_column_privilege('authenticated', format('public.%I', p.tablename), 'insert')
        when 'UPDATE' then has_any_column_privilege('authenticated', format('public.%I', p.tablename), 'update')
        when 'DELETE' then has_table_privilege('authenticated', format('public.%I', p.tablename), 'delete')
        else has_table_privilege('authenticated', format('public.%I', p.tablename), 'select,insert,update,delete')
      end;`);
  if (missing) throw new Error(`RLS policies without a matching grant for authenticated: ${missing}`);

  const views = db.sql(`select coalesce(string_agg(c.relname, ', '), '') from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and not has_table_privilege('authenticated', c.oid, 'select');`);
  if (views) throw new Error(`views not readable by authenticated: ${views}`);

  const anon = db.sql(`select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
      and (has_any_column_privilege('anon', c.oid, 'select') or has_any_column_privilege('anon', c.oid, 'insert')
        or has_any_column_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'));`);
  if (anon) throw new Error(`anon has data access on: ${anon}`);

  return "every authenticated RLS policy is backed by an explicit grant, views are readable, anon has no data access";
}
