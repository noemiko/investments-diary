// Build the complete migration chain in a disposable database inside local Supabase.
// Existing diary data is never reset or modified.
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = "supabase_db_investments-diary";
const database = `close_test_${randomBytes(6).toString("hex")}`;
function docker(args, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...args], { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Database command failed");
  return result.stdout;
}
const directory = new URL("../supabase/migrations/", import.meta.url);
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const saleMigration = "20261028120000_close_position.sql";
if (!migrations.includes(saleMigration)) throw new Error("Sale migration not found");
const fixture = `
insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
insert into reason_categories(id,user_id,name) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B');
insert into wallets(id,user_id,name,starting_value) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A',1000),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B',0);
insert into positions(id,user_id,instrument,buy_price,buy_date,quantity,category_id,wallet_id,reason_text,broker_label,current_price,price_date,deleted_at) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','open',50,'2026-01-01',10,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Keep original reason','Broker',60,'2026-10-01',null),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','deleted',0.00000001,'2026-01-01',null,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,null,null,null,'2026-10-01T12:00:00Z'),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','foreign',999999999999.99999999,'2026-01-01',null,'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',null,null,null,null,null);
create temporary table positions_before as select id,to_jsonb(p) facts from positions p;
create temporary table policies_before as select * from pg_policies where schemaname='public';
`;
const chain = migrations
  .map((name) => `${name === saleMigration ? fixture : ""}\n${readFileSync(new URL(name, directory), "utf8")}`)
  .join("\n");
const sql = `
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
${chain}
grant all on all tables in schema public to authenticated, anon;
do $$ begin
 if (select count(*) from positions) <> 3 then raise exception 'migration lost existing rows'; end if;
 if exists(select 1 from positions p join positions_before b using(id) where to_jsonb(p)-'sell_price'-'sell_date' <> b.facts)
 then raise exception 'migration altered existing facts'; end if;
 if exists(select 1 from positions where sell_price is not null or sell_date is not null)
 then raise exception 'existing rows did not remain open'; end if;
 if exists((select * from pg_policies where schemaname='public' except select * from policies_before)
 union all (select * from policies_before except select * from pg_policies where schemaname='public'))
 then raise exception 'migration altered ownership policies'; end if;
 if exists(select 1 from pg_class where oid='public.positions'::regclass and not relrowsecurity)
 then raise exception 'RLS disabled'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$ declare n integer; violated_constraint text; begin
 if (select count(*) from positions) <> 2 then raise exception 'owner cannot read own open and deleted rows'; end if;
 if exists(select 1 from positions where instrument='foreign') then raise exception 'foreign read leaked'; end if;
 update positions set sell_price=60,sell_date='2026-01-01' where id='30000000-0000-4000-8000-000000000003';
 get diagnostics n=row_count;
 if n <> 0 then raise exception 'foreign close permitted'; end if;
 update positions set current_price=70,price_date='2026-10-02' where id='30000000-0000-4000-8000-000000000003';
 get diagnostics n=row_count;
 if n <> 0 then raise exception 'foreign reprice permitted'; end if;
 begin
  update positions set sell_price=60 where instrument='open';
  raise exception 'price-only sale allowed';
 exception when check_violation then
  get stacked diagnostics violated_constraint=constraint_name;
  if violated_constraint <> 'positions_sale_pair' then raise exception 'wrong pair constraint: %',violated_constraint; end if;
 end;
 begin
  update positions set sell_date='2026-01-01' where instrument='open';
  raise exception 'date-only sale allowed';
 exception when check_violation then
  get stacked diagnostics violated_constraint=constraint_name;
  if violated_constraint <> 'positions_sale_pair' then raise exception 'wrong pair constraint: %',violated_constraint; end if;
 end;
 begin
  update positions set sell_price=-1,sell_date='2026-01-01' where instrument='open';
  raise exception 'negative sale allowed';
 exception when check_violation then
  get stacked diagnostics violated_constraint=constraint_name;
  if violated_constraint <> 'positions_sell_price_nonnegative' then raise exception 'wrong nonnegative constraint: %',violated_constraint; end if;
 end;
 begin
  update positions set sell_price=60,sell_date='2025-12-31' where instrument='open';
  raise exception 'pre-buy sale allowed';
 exception when check_violation then
  get stacked diagnostics violated_constraint=constraint_name;
  if violated_constraint <> 'positions_sell_date_after_buy' then raise exception 'wrong date constraint: %',violated_constraint; end if;
 end;
 update positions set sell_price=0,sell_date='2026-01-01' where instrument='open';
 if not exists(select 1 from positions where instrument='open' and sell_price=0 and sell_date='2026-01-01' and current_price=60 and price_date='2026-10-01')
 then raise exception 'zero same-day sale failed or retained quote changed'; end if;
 delete from positions;
 get diagnostics n=row_count;
 if n <> 0 then raise exception 'hard deletion permitted'; end if;
end $$;
reset role;
set role anon;
do $$ begin
 if exists(select 1 from positions) then raise exception 'anonymous read permitted'; end if;
end $$;
reset role;
`;
let created = false;
try {
  docker(["createdb", "-U", "postgres", database]);
  created = true;
  docker(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], sql);
  console.log("PASS fresh migration chain, existing open/deleted facts, sale constraints and ownership isolation");
} finally {
  if (created) docker(["dropdb", "-U", "postgres", database]);
}
