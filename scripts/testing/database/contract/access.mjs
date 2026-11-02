// Owner-only access for every table in `public`. Smoke reaches the data only through the app's pages, and the
// local stack's permissive defaults hid production's 42501, so direct table access is proven here under the
// privileges the chain itself creates. Tables come from the catalogue: a new table without RLS, without
// `user_id` or without a fixture below fails the domain until someone states how its owners are seeded.
import { asAnon, asPrivileged, asUser, assert, expectError, fixtureId } from "../lib/db-harness.mjs";

const id = (kind, owner) => fixtureId("access", kind, owner);
const user = (owner) => id(0, owner);
const A = 1;
const B = 2;

// One builder per table, in foreign-key order: seeding runs top to bottom as the privileged role.
// - seed(owner): that owner's row; idempotent, so the domain can rerun on the same database.
// - foreign(owner): A's attempt to create a row for B. Only columns authenticated may insert are named, so
//   where a table accepts inserts at all, RLS `WITH CHECK` is what refuses it.
// - update: [column, value] for A's attempt to change B's rows. On a table with an UPDATE privilege the
//   column must be one authenticated may update, or the column privilege answers 42501 before RLS filters.
const fixtures = {
  reason_categories: {
    seed: (o) => `insert into public.reason_categories (id, user_id, name)
      values ('${id(1, o)}', '${user(o)}', 'Access ${o}') on conflict do nothing`,
    foreign: (o) => `insert into public.reason_categories (user_id, name) values ('${user(o)}', 'Foreign')`,
    update: ["name", "'Changed'"],
  },
  wallets: {
    seed: (o) => `insert into public.wallets (id, user_id, name, starting_value)
      values ('${id(2, o)}', '${user(o)}', 'Access ${o}', 100) on conflict do nothing`,
    foreign: (o) => `insert into public.wallets (user_id, name, starting_value) values ('${user(o)}', 'Foreign', 0)`,
    update: ["name", "'Changed'"],
  },
  market_listing_targets: {
    seed: (o) => `insert into public.market_listing_targets
        (id, user_id, provider, symbol, exchange, listing_name, exchange_name, instrument_type)
      values ('${id(3, o)}', '${user(o)}', 'yahoo', 'AAPL', 'NMS', 'Apple Inc.', 'NasdaqGS', 'EQUITY')
      on conflict do nothing`,
    foreign: (o) => `insert into public.market_listing_targets
        (user_id, provider, symbol, exchange, listing_name, exchange_name, instrument_type)
      values ('${user(o)}', 'yahoo', 'MSFT', 'NMS', 'Microsoft', 'NasdaqGS', 'EQUITY')`,
    update: ["listing_name", "'Changed'"],
  },
  market_selection_receipts: {
    seed: (o) => `insert into public.market_selection_receipts (id, user_id, wallet_id, target_id)
      values ('${id(4, o)}', '${user(o)}', '${id(2, o)}', '${id(3, o)}') on conflict do nothing`,
    foreign: (o) => `insert into public.market_selection_receipts (user_id, wallet_id, target_id)
      values ('${user(o)}', '${id(2, o)}', '${id(3, o)}')`,
    update: ["valid_until", "statement_timestamp()"],
  },
  // positions_guard_selection takes the target from a live receipt at insert time (market_target_id is NOT
  // NULL), so the row is seeded once and skipped on reruns instead of re-firing the guard on an old receipt.
  // The foreign attempt carries no selection: the guard reads receipts as A, so B's receipt would be refused
  // by the guard (23514) before RLS is reached.
  positions: {
    seed: (o) => `insert into public.positions
        (id, user_id, instrument, buy_price, buy_date, category_id, wallet_id, market_selection_receipt_id)
      select '${id(5, o)}', '${user(o)}', 'AAPL', 10, date '2026-10-01', '${id(1, o)}', '${id(2, o)}', '${id(4, o)}'
      where not exists (select 1 from public.positions where id = '${id(5, o)}')`,
    foreign: (o) => `insert into public.positions (user_id, instrument, buy_price, buy_date, category_id, wallet_id)
      values ('${user(o)}', 'AAPL', 10, date '2026-10-01', '${id(1, o)}', '${id(2, o)}')`,
    update: ["reason_text", "'Changed'"],
  },
  market_quote_cache: {
    seed: (o) => `insert into public.market_quote_cache
        (id, user_id, provider, symbol, exchange, currency, timezone, listing_name, exchange_name, instrument_type)
      values ('${id(6, o)}', '${user(o)}', 'yahoo', 'AAPL', 'NMS', 'USD', 'America/New_York', 'Apple Inc.',
        'NasdaqGS', 'EQUITY') on conflict do nothing`,
    foreign: (o) => `insert into public.market_quote_cache
        (user_id, provider, symbol, exchange, currency, timezone, listing_name, exchange_name, instrument_type)
      values ('${user(o)}', 'yahoo', 'MSFT', 'NMS', 'USD', 'America/New_York', 'Microsoft', 'NasdaqGS', 'EQUITY')`,
    update: ["source_name", "'Changed'"],
  },
  market_listing_lookups: {
    seed: (o) => `insert into public.market_listing_lookups (id, user_id, position_id, symbol)
      values ('${id(7, o)}', '${user(o)}', '${id(5, o)}', 'AAPL') on conflict do nothing`,
    foreign: (o) => `insert into public.market_listing_lookups (user_id, position_id, symbol)
      values ('${user(o)}', '${id(5, o)}', 'MSFT')`,
    update: ["symbol", "'CHANGED'"],
  },
  wallet_snapshots: {
    seed: (o) => `insert into public.wallet_snapshots (wallet_id, user_id, observation_day, captured_at,
        starting_value, value, realised_change, open_change, realised_count, open_count, not_counted, currency)
      values ('${id(2, o)}', '${user(o)}', date '2026-11-01', timestamptz '2026-11-01 12:00:00+00',
        100, 100, 0, 0, 0, 0, 0, 'USD') on conflict do nothing`,
    foreign: (o) => `insert into public.wallet_snapshots (wallet_id, user_id, observation_day, captured_at,
        starting_value, value, realised_change, open_change, realised_count, open_count, not_counted, currency)
      values ('${id(2, o)}', '${user(o)}', date '2026-11-02', timestamptz '2026-11-02 12:00:00+00',
        100, 100, 0, 0, 0, 0, 0, 'USD')`,
    update: ["not_counted", "1"],
  },
};

const rows = (output) => (output ? output.split("\n").map((line) => line.split("|")) : []);

export default function access(db) {
  // Catalogue: every ordinary table, whether RLS is on, whether it has an owner column, and whether
  // authenticated may update it at all (the expected foreign-UPDATE outcome follows production's privileges).
  const tables = rows(
    db.sql(`select c.relname, c.relrowsecurity::int,
        exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id'
          and not a.attisdropped)::int,
        has_any_column_privilege('authenticated', c.oid, 'update')::int
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by c.relname;`),
  ).map(([name, rls, owner, updatable]) => ({
    name,
    rls: rls === "1",
    owner: owner === "1",
    updatable: updatable === "1",
  }));
  if (tables.length === 0) throw new Error("no tables found in public");
  for (const table of tables) {
    if (!table.rls) throw new Error(`RLS is not enabled on ${table.name}`);
    if (!table.owner) throw new Error(`${table.name} has no user_id column`);
    if (!fixtures[table.name]) throw new Error(`add an access fixture for ${table.name}`);
  }

  // A foreign-UPDATE column authenticated cannot update would pass for the wrong reason (42501, not RLS).
  const updatable = tables.filter((table) => table.updatable);
  if (updatable.length > 0) {
    const blocked = db.sql(`select coalesce(string_agg(t.name || '.' || t.col, ', '), '') from (values
      ${updatable.map((table) => `('${table.name}', '${fixtures[table.name].update[0]}')`).join(", ")}) t(name, col)
      where not has_column_privilege('authenticated', format('public.%I', t.name), t.col, 'update');`);
    if (blocked) throw new Error(`foreign-update columns authenticated cannot update, pick a granted one: ${blocked}`);
  }

  // Seed both owners as the privileged role, which bypasses RLS and every privilege check.
  db.sql(`${asPrivileged()}
    insert into auth.users (id) values ('${user(A)}'), ('${user(B)}') on conflict do nothing;
    ${Object.values(fixtures)
      .flatMap((fixture) => [fixture.seed(A), fixture.seed(B)])
      .join(";\n")};`);

  // B's rows, fingerprinted as the privileged role before and after A's attempts.
  const fingerprint = () =>
    db.sql(`${asPrivileged()}
      ${tables
        .map(
          (table) => `select '${table.name}', coalesce(md5(string_agg(row_to_json(t)::text, ',' order by
            row_to_json(t)::text)), 'none') from public.${table.name} t where user_id = '${user(B)}'`,
        )
        .join("\nunion all ")};`);
  const before = fingerprint();

  // Signed in as A. Each check names the table, so a failure points at the table whose access leaked.
  db.sql(`${asUser(user(A))}
    ${tables
      .map(({ name, updatable }) => {
        const [column, value] = fixtures[name].update;
        const update = `update public.${name} set ${column} = ${value} where user_id = '${user(B)}'`;
        return [
          assert(`(select count(*) from public.${name} where user_id = '${user(A)}') > 0`, `A cannot read own ${name}`),
          assert(`(select count(*) from public.${name} where user_id = '${user(B)}') = 0`, `A can read B's ${name}`),
          updatable
            ? `do $update$ declare changed bigint; begin ${update}; get diagnostics changed = row_count;
                if changed <> 0 then raise exception 'A updated % of B''s ${name} rows', changed; end if; end $update$;`
            : expectError("42501", update, `A's update of B's ${name} rows was not refused with 42501`),
          expectError(
            "42501",
            `delete from public.${name} where user_id = '${user(B)}'`,
            `A's delete of B's ${name} rows was not refused with 42501`,
          ),
          expectError(
            "42501",
            fixtures[name].foreign(B),
            `A's insert of a ${name} row for B was not refused with 42501`,
          ),
        ].join("\n");
      })
      .join("\n")}`);

  const after = fingerprint();
  if (after !== before) throw new Error(`B's rows changed during A's attempts:\nbefore ${before}\nafter ${after}`);

  // anon holds no table privilege, so even a read must fail outright rather than return no rows.
  db.sql(`${asAnon()}
    ${tables.map(({ name }) => expectError("42501", `perform 1 from public.${name}`, `anon read of ${name} was not refused with 42501`)).join("\n")}`);

  return `${tables.length} tables (${tables.map(({ name }) => name).join(", ")}): RLS on and owned by user_id; A reads only own rows and cannot update, delete or insert B's; anon reads nothing`;
}
