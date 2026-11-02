// Shared scaffolding for the disposable-database tests: never the diary database, never a hosted project.
// A fresh database has no default privileges, which matches production (hosted `postgres` default ACL gives
// anon/authenticated no data privileges). So this helper installs only the fake `auth` schema and schema
// `usage`; every table, sequence and function privilege must come from the migration chain itself.
// Never add a table, sequence or function grant here: a hand grant hides production's 42501.
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

export const container = "supabase_db_investments-diary";
// pg_cron only installs in its configured database; test its migration separately with test:wallet-cron.
export const cronMigration = "20261028170000_register_daily_wallet_snapshot_job.sql";

const directory = new URL("../../../../supabase/migrations/", import.meta.url);

// Sorted migration chain without the cron migration. `until` cuts the chain before that file (exclusive),
// for fixtures that must be seeded part-way through; the remainder is `migrationFiles().slice(cut.length)`.
export function migrationFiles({ until } = {}) {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && name !== cronMigration)
    .sort();
  if (until === undefined) return files;
  const index = files.indexOf(until);
  if (index < 0) throw new Error(`Migration ${until} not found`);
  return files.slice(0, index);
}

export const readMigration = (name) => readFileSync(new URL(name, directory), "utf8");

// Each domain owns one UUID prefix, so fixtures on the shared replay never collide or leak between domains.
// Build ids with fixtureId(domain, kind, index): users are kind 0, then any per-domain numbering.
export const fixturePrefixes = Object.freeze({
  grants: "a0",
  wallets: "a1",
  positions: "a2",
  "market-prices": "a3",
  snapshots: "a4",
  access: "a5",
});

export function fixtureId(domain, kind, index) {
  const prefix = fixturePrefixes[domain];
  if (!prefix) throw new Error(`No fixture prefix registered for domain ${domain}`);
  return `${prefix}${String(kind).padStart(6, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

// Role switches, prepended to the statements they govern. Every sql() call is its own psql connection,
// so a role never outlives the call that set it; asPrivileged() still resets explicitly inside a script.
export const asUser = (id) => `set role authenticated; set request.jwt.claim.sub = '${id}';`;
export const asAnon = () => "set role anon; set request.jwt.claim.sub = '';";
export const asPrivileged = () => "reset role; set request.jwt.claim.sub = '';";

const literal = (text) => `'${String(text).replaceAll("'", "''")}'`;

// SQL assertions, composed into a script like the statements around them. A failure raises with the
// message, which psql reports and the runner prints next to the failing domain.
export const assert = (condition, message) =>
  `do $assert$ begin if not coalesce((${condition}), false) then raise exception '%', ${literal(message)}; end if; end $assert$;`;

// The statement must fail with exactly `sqlstate`. Success or any other error fails the assertion; an
// unexpected success is rolled back with the failing DO block.
export function expectError(sqlstate, statement, message = statement) {
  const body = statement.trim().replace(/;+$/, "");
  return `do $expect$ declare got text := 'no error'; begin
  begin ${body}; exception when others then got := sqlstate; end;
  if got is distinct from ${literal(sqlstate)} then
    raise exception 'expected SQLSTATE %, got %: %', ${literal(sqlstate)}, got, ${literal(message)};
  end if;
end $expect$;`;
}

const docker = (args, input) => {
  try {
    return execFileSync("docker", ["exec", "-i", container, ...args], {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(error.stderr?.toString().trim() || error.message, { cause: error });
  }
};

// A randomly named disposable database in the local Supabase container. Call create() first and drop()
// in `finally`; drop() is a no-op when create() never succeeded.
export function disposableDatabase(prefix) {
  const name = `${prefix}_${randomBytes(6).toString("hex")}`;
  const psqlArgs = ["psql", "-U", "postgres", "-d", name, "-v", "ON_ERROR_STOP=1", "-Atq"];
  let created = false;

  const sql = (input) => docker(psqlArgs, input).trim();

  // Runs every input in its own real connection at the same time; resolves with each session's output.
  const concurrent = (...inputs) => {
    if (inputs.length < 2) throw new Error("concurrent() needs at least two sessions");
    return Promise.all(
      inputs.map(
        (input) =>
          new Promise((resolve, reject) => {
            const child = spawn("docker", ["exec", "-i", container, ...psqlArgs], { stdio: ["pipe", "pipe", "pipe"] });
            let out = "",
              err = "";
            child.stdout.on("data", (d) => (out += d));
            child.stderr.on("data", (d) => (err += d));
            child.on("error", reject);
            child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim()))));
            child.stdin.end(input);
          }),
      ),
    );
  };

  return {
    name,
    sql,
    concurrent,
    create() {
      docker(["createdb", "-U", "postgres", name]);
      created = true;
    },
    drop() {
      if (created) docker(["dropdb", "-U", "postgres", name]);
      created = false;
    },
    // Fake Supabase `auth`: auth.uid() reads the request.jwt.claim.sub setting. Schema usage only.
    installAuth() {
      sql(`create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as
          'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
        grant usage on schema auth,public to authenticated,anon;`);
    },
    replay(files) {
      sql(files.map(readMigration).join("\n"));
    },
  };
}
