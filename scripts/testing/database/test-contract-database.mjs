// The database contract test: every permanent schema rule, checked on the final schema under production
// privileges. One disposable database replays the whole chain once (no default privileges, no hand grants),
// then each domain runs its fixtures and assertions against it in a fixed order. Never the diary database.
// Usage: node scripts/testing/database/test-contract-database.mjs [--only <domain>]
import { disposableDatabase, migrationFiles } from "./lib/db-harness.mjs";
import grants from "./contract/grants.mjs";
import access from "./contract/access.mjs";
import portfolioExport from "./contract/portfolio-export.mjs";
import portfolioRecovery from "./contract/portfolio-recovery.mjs";

// Fixed order; later domains are appended here as they are ported.
const domains = [
  ["grants", grants],
  ["access", access],
  ["portfolio-export", portfolioExport],
  ["portfolio-recovery", portfolioRecovery],
];

const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex < 0 ? undefined : process.argv[onlyIndex + 1];
if (onlyIndex >= 0 && !domains.some(([name]) => name === only)) {
  console.error(`Unknown domain "${only}". Domains: ${domains.map(([name]) => name).join(", ")}`);
  process.exit(2);
}

const db = disposableDatabase("contract");
let current = "setup";
try {
  db.create();
  db.installAuth();
  db.replay(migrationFiles());
  for (const [name, run] of domains) {
    if (only && name !== only) continue;
    current = name;
    // Every domain must start as the privileged role with no signed-in user. Each sql() call is a fresh
    // connection, so a domain can only leak a role or claim through database- or role-level settings.
    const session = db.sql(
      "select current_user || '|' || coalesce(current_setting('request.jwt.claim.sub', true), '');",
    );
    if (session !== "postgres|") throw new Error(`domain did not start from a reset role: ${session}`);
    const summary = await run(db);
    console.log(`PASS ${name}: ${summary}`);
  }
} catch (error) {
  console.error(`FAIL ${current}: ${error.message}`);
  process.exitCode = 1;
} finally {
  db.drop();
}
