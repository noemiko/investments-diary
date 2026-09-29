// Smoke test: proves the Supabase auth flow still works end-to-end over HTTP (redirects, cookies, gating),
// and that one account cannot see or borrow another account's diary data.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// Creates two accounts per run — never point it at production.

import { randomBytes } from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const runId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = "Smoke-Test-Passw0rd!";

// Each account has its own cookie jar, so sessions never leak between them.
function account(label) {
  return { email: `smoke-${label}-${runId}@example.com`, jar: new Map() };
}
const a = account("a");
const b = account("b");
const anonymous = account("anon");

const instrument = `SMOKE-${runId}`;
const categoryName = `Smoke category ${runId}`;
let categoryId = "";

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(jar, response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((attr) => /max-age=0/i.test(attr.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(who, path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(who.jar),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(who.jar, response);
  const body = await response.text();
  return { status: response.status, location: response.headers.get("location") ?? "", body };
}

function decodeEntities(html) {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

// The id appears both in the island's serialized props (`"id":[0,"<uuid>"],"name":[0,"<name>"]`) and in
// `<option value="<uuid>"><name></option>`; in both, the id comes just before the name. So decode the
// entities, find the run-unique name, and take the last uuid preceding it.
function categoryIdFor(html, name) {
  const text = decodeEntities(html);
  const at = text.indexOf(name);
  if (at === -1) return "";
  const uuids = text
    .slice(Math.max(0, at - 200), at)
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  return uuids ? uuids[uuids.length - 1] : "";
}

function position(overrides = {}) {
  return {
    instrument,
    buy_price: "50,25",
    buy_date: new Date().toISOString().slice(0, 10),
    category_id: "",
    new_category_name: "",
    reason_text: "Smoke walk reason",
    quantity: "",
    broker_label: "",
    ...overrides,
  };
}

const tomorrowUtc = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const EMPTY_STATE = "Record your first investment";

// Each step: [name, run, expected]. `includes` / `excludes` are checked against the (entity-decoded) body.
const steps = [
  ["home renders", () => request(a, "/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request(a, "/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request(a, "/api/auth/signup", { method: "POST", form: { email: a.email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request(a, "/api/auth/signin", { method: "POST", form: { email: a.email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request(a, "/api/auth/signin", { method: "POST", form: { email: a.email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request(a, "/dashboard"), { status: 200 }],

  // Account A records a position under a new category.
  ["A: dashboard shows empty state", () => request(a, "/dashboard"), { status: 200, includes: [EMPTY_STATE] }],
  [
    "A: records a position with a new category",
    () => request(a, "/dashboard/new", { method: "POST", form: position({ new_category_name: categoryName }) }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "A: dashboard lists the position",
    () => request(a, "/dashboard"),
    { status: 200, includes: [instrument, "50.25", categoryName], excludes: [EMPTY_STATE] },
  ],
  [
    "A: form offers the new category",
    async () => {
      const result = await request(a, "/dashboard/new");
      categoryId = categoryIdFor(result.body, categoryName);
      return { ...result, location: categoryId ? `(category ${categoryId})` : "(category id not found)" };
    },
    { status: 200, includes: [categoryName], check: () => categoryId !== "" },
  ],

  ["signout clears session", () => request(a, "/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request(a, "/dashboard"), { status: 302, location: "/auth/signin" }],

  // Account B must not see or borrow A's data.
  [
    "B: signup creates account",
    () => request(b, "/api/auth/signup", { method: "POST", form: { email: b.email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "B: signin accepts correct password",
    () => request(b, "/api/auth/signin", { method: "POST", form: { email: b.email, password } }),
    { status: 302, location: "/" },
  ],
  [
    "B: dashboard does not list A's position",
    () => request(b, "/dashboard"),
    { status: 200, includes: [EMPTY_STATE], excludes: [instrument] },
  ],
  [
    "B: form does not offer A's category",
    () => request(b, "/dashboard/new"),
    { status: 200, excludes: [categoryName], check: () => categoryId !== "", excludesId: true },
  ],
  [
    "B: cannot record a position with A's category",
    () => request(b, "/dashboard/new", { method: "POST", form: position({ category_id: categoryId }) }),
    { status: 200, includes: ["Choose a category from your list"], excludesId: true },
  ],
  [
    "B: rejects a future buy date",
    () =>
      request(b, "/dashboard/new", {
        method: "POST",
        form: position({ buy_date: tomorrowUtc, new_category_name: `B ${categoryName}` }),
      }),
    { status: 200, includes: ["The buy date cannot be in the future"] },
  ],
  [
    "B: dashboard still has no positions",
    () => request(b, "/dashboard"),
    { status: 200, includes: [EMPTY_STATE], excludes: [instrument] },
  ],
  [
    "B: signout clears session",
    () => request(b, "/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],

  [
    "anonymous POST to form redirects to signin",
    () => request(anonymous, "/dashboard/new", { method: "POST", form: position({ new_category_name: categoryName }) }),
    { status: 302, location: "/auth/signin" },
  ],
];

function bodyProblems(actual, expected) {
  const body = decodeEntities(actual.body);
  const problems = [];
  for (const text of expected.includes ?? []) if (!body.includes(text)) problems.push(`missing "${text}"`);
  for (const text of expected.excludes ?? []) if (body.includes(text)) problems.push(`unexpected "${text}"`);
  if (expected.excludesId && categoryId && body.includes(categoryId)) problems.push(`unexpected A's category id`);
  if (expected.check && !expected.check()) problems.push("A's category id was not captured");
  return problems;
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const problems = bodyProblems(actual, expected);
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    problems.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
    for (const problem of problems) console.log(`      ${problem}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
