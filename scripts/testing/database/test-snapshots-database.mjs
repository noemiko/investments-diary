// Complete fresh chain and privileged capture in an isolated local database, never the diary.
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
const container = "supabase_db_investments-diary",
  database = `snapshots_test_${randomBytes(6).toString("hex")}`;
const run = (args, input) =>
  execFileSync("docker", ["exec", "-i", container, ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const psql = (sql) => run(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], sql);
const directory = new URL("../../../supabase/migrations/", import.meta.url);
const chain = readdirSync(directory)
  // pg_cron only installs in its configured database; test its migration separately with test:wallet-cron.
  .filter((f) => f.endsWith(".sql") && f !== "20261028170000_register_daily_wallet_snapshot_job.sql")
  .sort()
  .map((f) => readFileSync(new URL(f, directory), "utf8"))
  .join("\n");
let created = false;
try {
  run(["createdb", "-U", "postgres", database]);
  created = true;
  psql(`create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth,public to authenticated,anon; ${chain}
 insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
 insert into wallets(id,user_id,name,starting_value,currency) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Mixed',1000,'USD'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Empty',0,'USD');
 insert into reason_categories(id,user_id,name) values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Reason');
 insert into positions(user_id,wallet_id,category_id,instrument,buy_date,buy_price,quantity,current_price,price_date,sell_price,sell_date) values
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Closed','2026-01-01',50,10,999,'2026-10-01',60,'2026-02-01'),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Open','2026-01-01',10,20,12,'2026-10-01',null,null),
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Unknown','2026-01-01',10,null,12,'2026-01-02',null,null);
 `);
  // Two actual connections compete for the same unique daily observation.
  const capture = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "exec",
          "-i",
          container,
          "psql",
          "-U",
          "postgres",
          "-d",
          database,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "select public.capture_wallet_snapshots()",
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let error = "";
      child.stderr.on("data", (d) => (error += d));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(error))));
    });
  await Promise.all([capture(), capture()]);
  psql(`do $$ begin
 if (select count(*) from wallet_snapshots)<>2 then raise exception 'daily concurrency duplicated'; end if;
 if not exists(select 1 from wallet_snapshots where value=1140 and realised_change=100 and open_change=40 and realised_count=1 and open_count=1 and not_counted=1 and as_of='2026-10-01') then raise exception 'arithmetic oracle mismatch'; end if;
 if not exists(select 1 from wallet_snapshots where value=0 and open_count=0 and as_of is null) then raise exception 'empty wallet missing'; end if;
 if has_function_privilege('authenticated','public.capture_wallet_snapshots()','execute') or has_function_privilege('anon','public.capture_wallet_snapshots()','execute') then raise exception 'public capture executable'; end if;
 end $$;
 set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
 do $$ begin if (select count(*) from wallet_snapshots)<>1 then raise exception 'RLS isolation failed';end if;
 begin update wallet_snapshots set value=0; raise exception 'update permitted';exception when insufficient_privilege then null;end;
 begin delete from wallet_snapshots; raise exception 'delete permitted';exception when insufficient_privilege then null;end;
 begin insert into wallet_snapshots select * from wallet_snapshots; raise exception 'insert permitted';exception when insufficient_privilege then null;end;
 end $$;reset role;
 set role anon; do $$ begin begin perform * from wallet_snapshots; if found then raise exception 'anon read';end if;exception when insufficient_privilege then null;end;end $$;reset role;
 -- Simulate earlier real observations only in this disposable database.
 update wallet_snapshots set captured_at=captured_at-interval '2 days', observation_day=observation_day-2;
 update positions set deleted_at=now() where instrument='Closed';
 select capture_wallet_snapshots();
 do $$ begin if not exists(select 1 from wallet_snapshots where observation_day=(now() at time zone 'UTC')::date and value=1040) or not exists(select 1 from wallet_snapshots where value=1140) then raise exception 'historical deletion changed old point';end if;end $$;
 update positions set deleted_at=null where instrument='Closed'; select capture_wallet_snapshots();
 do $$ begin if (select count(*) from wallet_snapshots)<>4 or not exists(select 1 from wallet_snapshots where value=1040) then raise exception 'retry overwrote point';end if;end $$;
 -- Simulate successive days to prove restores, baseline edits and closing affect only later points.
 update wallet_snapshots set captured_at=captured_at-interval '1 day', observation_day=observation_day-1;
 select capture_wallet_snapshots();
 do $$ begin if not exists(select 1 from wallet_snapshots where observation_day=(now() at time zone 'UTC')::date and value=1140) or not exists(select 1 from wallet_snapshots where value=1040) then raise exception 'restore observation mismatch';end if;end $$;
 update wallet_snapshots set captured_at=captured_at-interval '1 day', observation_day=observation_day-1;
 update wallets set starting_value=2000 where name='Mixed';
 update positions set sell_price=13,sell_date='2026-10-01' where instrument='Open';
 select capture_wallet_snapshots();
 do $$ begin if not exists(select 1 from wallet_snapshots where observation_day=(now() at time zone 'UTC')::date and value=2160 and realised_change=160 and open_count=0 and as_of is null) then raise exception 'close/baseline observation mismatch';end if;end $$;
 update positions set sell_price=null,sell_date=null where instrument='Open';
 -- Negative and >numeric(20,8) totals survive capture exactly.
 update wallets set starting_value=0 where name='Mixed';
 update positions set sell_price=0 where instrument='Closed';
 update positions set quantity=999999999999.99999999,buy_price=999999999999.99999998,current_price=999999999999.99999999 where instrument='Open';
 update wallet_snapshots set captured_at=captured_at-interval '10 days', observation_day=observation_day-10;
 select capture_wallet_snapshots();
 do $$ begin if not exists(select 1 from wallet_snapshots where observation_day=(now() at time zone 'UTC')::date and value=9499.9999999999999999) then raise exception 'aggregate exactness lost';end if;end $$;
 `);
  console.log(
    "PASS fresh snapshots migration, exact totals, concurrent idempotency, RLS/write restrictions, gaps and immutable history",
  );
} finally {
  if (created) run(["dropdb", "-U", "postgres", database]);
}
