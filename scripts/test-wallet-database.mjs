// Isolated migration/RLS fixtures. Uses a temporary database in the existing local Supabase
// Postgres container; never resets the diary database or connects to a remote project.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = "supabase_db_investments-diary";
const database = `wallet_test_${randomBytes(6).toString("hex")}`;
function docker(args, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...args], { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Database command failed");
  return result.stdout;
}
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const sql = `
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
${migration("20260929141102_create_diary_core.sql")}
${migration("20261015094649_add_position_current_price.sql")}
insert into auth.users values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
insert into reason_categories (id,user_id,name) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B');
insert into positions (user_id,instrument,buy_price,buy_date,category_id,deleted_at) values
 ('00000000-0000-4000-8000-000000000001','open',10,'2026-01-01','10000000-0000-4000-8000-000000000001',null),
 ('00000000-0000-4000-8000-000000000001','deleted',10,'2026-01-01','10000000-0000-4000-8000-000000000001',now()),
 ('00000000-0000-4000-8000-000000000002','B',10,'2026-01-01','10000000-0000-4000-8000-000000000002',null);
${migration("20261019112848_create_wallets.sql")}
${migration("20261019150000_prevent_wallet_deletion.sql")}
grant all on all tables in schema public to authenticated, anon;
do $$ begin
 if (select count(*) from positions) <> 3 then raise exception 'backfill lost entries'; end if;
 if (select count(*) from positions where deleted_at is not null) <> 1 then raise exception 'backfill changed deletion state'; end if;
 if (select count(*) from wallets) <> 2 then raise exception 'empty owner received wallet'; end if;
 if exists(select 1 from wallets where name <> 'Main' or starting_value <> 0) then raise exception 'incorrect Main wallet'; end if;
 if exists(select 1 from positions p join wallets w on w.id=p.wallet_id where p.user_id <> w.user_id) then raise exception 'wrong backfill owner'; end if;
 if (select count(distinct wallet_id) from positions where user_id='00000000-0000-4000-8000-000000000001') <> 1 then raise exception 'deleted entry not assigned to Main'; end if;
end $$;
-- Ordinary authenticated role with an author claim; no superuser bypass in these assertions.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$ declare own_wallet uuid; n integer; begin
 if (select count(*) from wallets) <> 1 then raise exception 'RLS leaked foreign wallet'; end if;
 select id into own_wallet from wallets;
 update wallets set name='Retirement',starting_value=1000 where id=own_wallet;
 if not exists(select 1 from wallets where name='Retirement' and starting_value=1000) then raise exception 'owner edit failed'; end if;
 begin
  update wallets set deleted_at=now() where id=own_wallet;
  raise exception 'soft delete permitted';
 exception when check_violation then null; end;
 delete from wallets where id=own_wallet;
 get diagnostics n=row_count;
 if n <> 0 or not exists(select 1 from wallets where id=own_wallet) then raise exception 'hard delete permitted'; end if;
 begin
  insert into wallets(user_id,name,starting_value) values(auth.uid(),'retirement',0);
  raise exception 'duplicate name permitted';
 exception when unique_violation then null; end;
 begin
  insert into wallets(user_id,name,starting_value) values(auth.uid(),'Negative',-1);
  raise exception 'negative value permitted';
 exception when check_violation then null; end;
 begin
  insert into positions(user_id,instrument,buy_price,buy_date,category_id,wallet_id)
   values(auth.uid(),'missing wallet',10,'2026-01-01','10000000-0000-4000-8000-000000000001',null);
  raise exception 'missing assignment permitted';
 exception when not_null_violation then null; end;
end $$;
reset role;
-- Keep the foreign UUID in a transaction setting before entering the restricted role.
select set_config('wallet_test.foreign_id',(select id::text from wallets where user_id='00000000-0000-4000-8000-000000000002'),false);
set role authenticated;
do $$ declare foreign_wallet uuid := current_setting('wallet_test.foreign_id')::uuid; n integer; begin
 update wallets set name='Stolen' where id=foreign_wallet;
 get diagnostics n=row_count;
 if n <> 0 then raise exception 'foreign update permitted'; end if;
 begin
  insert into positions(user_id,instrument,buy_price,buy_date,category_id,wallet_id)
   values(auth.uid(),'foreign wallet',10,'2026-01-01','10000000-0000-4000-8000-000000000001',foreign_wallet);
  raise exception 'foreign assignment permitted';
 exception when foreign_key_violation then null; end;
end $$;
reset role;
set role anon;
do $$ begin
 if exists(select 1 from wallets) then raise exception 'anonymous read permitted'; end if;
end $$;
reset role;
`;
let created = false;
try {
  docker(["createdb", "-U", "postgres", database]);
  created = true;
  docker(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], sql);
  console.log("PASS wallet migration backfill, validation, authenticated ownership and deletion restrictions");
} finally {
  if (created) docker(["dropdb", "-U", "postgres", database]);
}
