import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { gunzipSync, inflateSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

// All injected code lives in a disposable copy; never load the developer's .env or a real database.
const root = resolve(import.meta.dirname, "..");
const work = await mkdtemp(join(tmpdir(), "diary-sentry-"));
const app = join(work, "app");
const secret = "PRIVATE_PROBE_SENTINEL";
const events = [];
const itemTypes = [];
const results = [];
let refuse = false;
let child;
let browser;
let output = "";
const ingest = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type,sentry-trace,baggage");
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  const chunks = [];
  for await (const part of request) chunks.push(part);
  let payload = Buffer.concat(chunks);
  if (request.headers["content-encoding"] === "gzip") payload = gunzipSync(payload);
  if (request.headers["content-encoding"] === "deflate") payload = inflateSync(payload);
  const body = payload.toString("utf8");
  if (refuse) return response.writeHead(503).end();
  // Error envelopes have a JSON envelope header, item header and JSON event per item.
  const lines = body.split("\n");
  for (let index = 1; index < lines.length - 1; index += 2) {
    try {
      const type = JSON.parse(lines[index]).type;
      itemTypes.push(type);
      if (type === "event") events.push(JSON.parse(lines[index + 1]));
    } catch {
      // Non-JSON envelope items are not error events.
    }
  }
  response.writeHead(200, { "content-type": "application/json" }).end("{}");
});
const portReservation = createServer();
let origin;

async function listen(server) {
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      done();
    });
  });
  return server.address().port;
}

async function close(server) {
  server.closeAllConnections();
  if (server.listening) await new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())));
}
const excluded = new Set([
  "node_modules",
  ".git",
  ".astro",
  ".vercel",
  "dist",
  "context",
  "reports",
  "test-results",
  "playwright-report",
]);

async function waitFor(predicate, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`Astro exited: ${output}`);
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}\n${output}`);
}

function checkEvent(event) {
  const serialized = JSON.stringify(event);
  assert(!serialized.includes(secret), "Private sentinel leaked into event");
  for (const field of ["request", "user", "breadcrumbs", "extra"]) assert(!event[field], `Unexpected ${field}`);
  assert.equal(event.environment, "development");
  assert(event.release, "Release missing");
  assert(event.exception?.values?.length, "Exception structure missing");
}

async function probe(label, path, init, expectedOperation, verifyResponse) {
  const before = events.length;
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    signal: globalThis.AbortSignal.timeout(20000),
    ...init,
  });
  const body = await response.text();
  verifyResponse(response, body);
  await waitFor(
    () => events.slice(before).some((event) => !expectedOperation || event.tags?.operation === expectedOperation),
    label,
  );
  const matching = events
    .slice(before)
    .filter((event) => !expectedOperation || event.tags?.operation === expectedOperation);
  matching.forEach(checkEvent);
  if (expectedOperation) {
    assert(matching[0].tags?.request_id, `${label}: request ID missing`);
    assert(matching[0].tags?.route, `${label}: route pattern missing`);
  }
  if (expectedOperation) assert.equal(matching.length, 1, `${label}: duplicate reports`);
  results.push({ label, status: response.status, events: matching.length });
}

try {
  const ingestPort = await listen(ingest);
  const port = await listen(portReservation);
  await close(portReservation);
  origin = `http://127.0.0.1:${port}`;
  await cp(root, app, {
    recursive: true,
    filter: (path) => !excluded.has(basename(path)) && !basename(path).startsWith(".env"),
  });
  await symlink(join(root, "node_modules"), join(app, "node_modules"));
  await writeFile(
    join(app, "src/lib/supabase.ts"),
    `
import { createClient as sdkClient } from "@supabase/supabase-js";
export function createClient() {
  const client = sdkClient("http://127.0.0.1:1", "local-probe-only", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = String(input);
      if (url.includes("/auth/")) return new Response(JSON.stringify({message:"${secret}"}), {status:503,headers:{"content-type":"application/json"}});
      return new Response(JSON.stringify({code:"XX000",message:"${secret}",details:"${secret}",hint:"${secret}"}), {status:500,headers:{"content-type":"application/json"}});
    } }
  });
  client.auth.getUser = async () => ({data:{user:{id:"11111111-1111-4111-8111-111111111111"}},error:null}) as never;
  return client;
}
`,
  );
  await mkdir(join(app, "src/pages/api"), { recursive: true });
  await writeFile(
    join(app, "src/pages/api/sentry-probe.ts"),
    `export function GET() { throw new Error("${secret}"); }`,
  );
  await writeFile(
    join(app, "src/pages/sentry-probe.astro"),
    `---\n---\n<html lang="en"><head><title>Local Sentry probe</title></head><body><script>setTimeout(() => { throw new Error("${secret}"); }, 500);</script></body></html>`,
  );
  // Construct the environment explicitly: no inherited Sentry credentials or database settings.
  const env = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "SystemRoot"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
  Object.assign(env, {
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_KEY: "local-probe-only",
    PUBLIC_SENTRY_DSN: `http://local@127.0.0.1:${ingestPort}/1`,
    ASTRO_TELEMETRY_DISABLED: "1",
    ASTRO_DISABLE_UPDATE_CHECK: "true",
    VERCEL_GIT_COMMIT_SHA: "local-sentry-probe",
    CI: "1",
  });
  child = spawn(
    process.execPath,
    [join(root, "node_modules/astro/bin/astro.mjs"), "dev", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  await waitFor(async () => {
    try {
      return (await fetch(`${origin}/auth/signin`, { signal: globalThis.AbortSignal.timeout(2000) })).status === 200;
    } catch {
      return false;
    }
  }, "Astro startup");
  await probe(
    "caught read",
    `/dashboard/deleted?private=${secret}`,
    { headers: { Cookie: `private=${secret}` } },
    "listDeletedPositions",
    (response, body) => {
      assert.equal(response.status, 200);
      assert(body.includes("Your deleted positions could not be loaded"));
    },
  );
  const deletion = "/dashboard/positions/11111111-1111-4111-8111-111111111111/delete";
  await probe(
    "unexpected write",
    deletion,
    { method: "POST", headers: { Origin: origin } },
    "deletePosition",
    (response) => {
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), "/dashboard?error=delete_failed");
    },
  );
  await probe(
    "auth 503",
    "/api/auth/signin",
    {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams({ email: `${secret}@example.invalid`, password: secret }),
    },
    "auth.signIn",
    (response) => {
      assert.equal(response.status, 302);
      assert(response.headers.get("location").startsWith("/auth/signin?error="));
    },
  );
  await probe("uncaught server", "/api/sentry-probe", {}, null, (response) => assert.equal(response.status, 500));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const beforeBrowser = events.length;
  await page.goto(`${origin}/sentry-probe`);
  await waitFor(() => events.length > beforeBrowser, "automatic browser exception");
  events.slice(beforeBrowser).forEach(checkEvent);
  results.push({ label: "automatic browser exception", events: events.length - beforeBrowser });
  await browser.close();
  browser = null;
  refuse = true;
  const response = await fetch(`${origin}${deletion}`, {
    method: "POST",
    headers: { Origin: origin },
    redirect: "manual",
    signal: globalThis.AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/dashboard?error=delete_failed");
  results.push({ label: "telemetry unavailable", status: response.status });
  assert(itemTypes.length > 0 && itemTypes.every((type) => type === "event"), "Unexpected non-error telemetry");
  await writeFile(join(work, "events.json"), JSON.stringify(events, null, 2));
  await writeFile(join(work, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ work, results }, null, 2));
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((done) => child.once("exit", done)), delay(5000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await close(portReservation);
  await close(ingest);
  await writeFile(join(work, "astro.log"), output);
  console.log(`Retained isolated probe copy and logs: ${work}`);
}
