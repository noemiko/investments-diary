// Smoke test: proves the Supabase auth flow still works end-to-end over HTTP (redirects, cookies, gating),
// and that one account cannot see or borrow another account's diary data.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// Creates two accounts per run — never point it at production.

import { randomBytes, randomUUID } from "node:crypto";

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
const reasonText = "Smoke walk reason";
let categoryId = "";
let positionId = "";

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

// Each category `<option>` carries `data-category-id`; match the one whose text is the run-unique name.
function categoryIdFor(html, name) {
  for (const [, id, text] of html.matchAll(
    /<option\b[^>]*\bdata-category-id="([0-9a-f-]{36})"[^>]*>([^<]*)<\/option>/gi,
  )) {
    if (decodeEntities(text) === name) return id;
  }
  return "";
}

// The dashboard links each position to its detail page; with one position recorded there is exactly one link.
function positionIdIn(html) {
  return html.match(/href="\/dashboard\/positions\/([0-9a-f-]{36})"/i)?.[1] ?? "";
}

function position(overrides = {}) {
  return {
    instrument,
    buy_price: "50,25",
    buy_date: new Date().toISOString().slice(0, 10),
    category_id: "",
    new_category_name: "",
    reason_text: reasonText,
    quantity: "",
    broker_label: "",
    ...overrides,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
// UTC, to match the server's `todayUtc()`.
const todayUtc = new Date().toISOString().slice(0, 10);
const tomorrowUtc = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
const yesterdayUtc = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
const EMPTY_STATE = "Record your first investment";
const NO_PRICE = "No price yet";
// Buy price 50,25 -> current price 60,3 is exactly +20%.
const RESULT = "+20.00%";
const detailPath = () => `/dashboard/positions/${positionId}`;

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
    // Captured before the no-JS step adds a second position, so the only link is this position's.
    "A: dashboard lists the position",
    async () => {
      const result = await request(a, "/dashboard");
      positionId = positionIdIn(result.body);
      return { ...result, location: positionId ? `(position ${positionId})` : "(position id not found)" };
    },
    {
      status: 200,
      includes: [instrument, "50.25", categoryName],
      excludes: [EMPTY_STATE],
      check: () => positionId !== "",
    },
  ],
  [
    "A: form offers the new category",
    async () => {
      const result = await request(a, "/dashboard/new");
      categoryId = categoryIdFor(result.body, categoryName);
      return { ...result, location: categoryId ? `(category ${categoryId})` : "(category id not found)" };
    },
    // The name input must be in the server-rendered HTML even with categories, so "New category…" works without JS.
    { status: 200, includes: [categoryName, 'name="new_category_name"'], check: () => categoryId !== "" },
  ],
  [
    // Without JS the select posts the "New category…" sentinel alongside the typed name.
    "A: records a position via the no-JS new-category path",
    () =>
      request(a, "/dashboard/new", {
        method: "POST",
        form: position({ category_id: "__new__", new_category_name: `No-JS ${categoryName}` }),
      }),
    { status: 302, location: "/dashboard" },
  ],

  // Account A opens the detail page and sets a current price.
  ["A: dashboard shows no price yet", () => request(a, "/dashboard"), { status: 200, includes: [NO_PRICE] }],
  [
    "A: detail page shows reason, category and no price yet",
    () => request(a, detailPath()),
    { status: 200, includes: [instrument, reasonText, categoryName, NO_PRICE] },
  ],
  [
    "A: rejects a future price date",
    () => request(a, detailPath(), { method: "POST", form: { current_price: "60,3", price_date: tomorrowUtc } }),
    { status: 200, includes: ["The price date cannot be in the future"] },
  ],
  [
    "A: rejects a price date before the buy date",
    () => request(a, detailPath(), { method: "POST", form: { current_price: "60,3", price_date: yesterdayUtc } }),
    { status: 200, includes: ["The price date cannot be before the buy date"] },
  ],
  [
    "A: sets a current price",
    () => request(a, detailPath(), { method: "POST", form: { current_price: "60,3", price_date: todayUtc } }),
    { status: 302, location: detailPath },
  ],
  ["A: dashboard shows the result", () => request(a, "/dashboard"), { status: 200, includes: [RESULT, "as of"] }],
  [
    "A: unknown position id returns 404",
    () => request(a, `/dashboard/positions/${randomUUID()}`),
    { status: 404, excludes: [instrument, reasonText] },
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
    "B: cannot open A's position",
    () => request(b, detailPath()),
    { status: 404, excludes: [instrument, reasonText], excludesId: true },
  ],
  [
    "B: cannot set a price on A's position",
    () => request(b, detailPath(), { method: "POST", form: { current_price: "1", price_date: todayUtc } }),
    { status: 404, excludes: [instrument, reasonText], excludesId: true },
  ],
  [
    "B: signout clears session",
    () => request(b, "/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],

  // A's price is unchanged by B's attempt.
  [
    "A: signin accepts correct password again",
    () => request(a, "/api/auth/signin", { method: "POST", form: { email: a.email, password } }),
    { status: 302, location: "/" },
  ],
  [
    "A: detail page still shows the result",
    () => request(a, detailPath()),
    { status: 200, includes: [RESULT, "as of"] },
  ],
  [
    "A: signout clears session again",
    () => request(a, "/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],

  [
    "anonymous POST to form redirects to signin",
    () => request(anonymous, "/dashboard/new", { method: "POST", form: position({ new_category_name: categoryName }) }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "anonymous: detail page redirects to signin",
    () => request(anonymous, detailPath()),
    { status: 302, location: "/auth/signin" },
  ],
];

function bodyProblems(actual, expected) {
  const body = decodeEntities(actual.body);
  const problems = [];
  for (const text of expected.includes ?? []) if (!body.includes(text)) problems.push(`missing "${text}"`);
  for (const text of expected.excludes ?? []) if (body.includes(text)) problems.push(`unexpected "${text}"`);
  if (expected.excludesId) {
    if (categoryId && body.includes(categoryId)) problems.push(`unexpected A's category id`);
    if (positionId && body.includes(positionId)) problems.push(`unexpected A's position id`);
  }
  if (expected.check && !expected.check()) problems.push("an id the step depends on was not captured");
  return problems;
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const problems = bodyProblems(actual, expected);
  // A function location is resolved now, once ids captured by earlier steps are known.
  const location = typeof expected.location === "function" ? expected.location() : expected.location;
  const ok =
    actual.status === expected.status &&
    (location === undefined || actual.location.startsWith(location)) &&
    problems.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${location ?? ""}`);
    for (const problem of problems) console.log(`      ${problem}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
