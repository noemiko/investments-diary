// Smoke test: proves the Supabase auth flow still works end-to-end over HTTP (redirects, cookies, gating),
// that a deleted position can be restored, and that one account cannot see, borrow, delete or restore
// another account's diary data.
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
const deletedInstrument = `DEL-${runId}`;
const categoryName = `Smoke category ${runId}`;
const reasonText = "Smoke walk reason";

// Ids captured from A's pages, so later steps can target them and check B never sees them.
const ids = { category: "", mainPosition: "", delPosition: "" };
const ID_LABELS = { category: "category", mainPosition: "main position", delPosition: "position to delete" };
// B's 404 body for an id that exists nowhere; a foreign id must render exactly the same page.
let unknownIdBody = "";

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

// Each position row carries a form posting to `/dashboard/positions/<id>/<action>`; match the row whose
// cell text is exactly the run-unique instrument.
function positionIdFor(html, name, action) {
  const actionPattern = new RegExp(`/dashboard/positions/([0-9a-f-]{36})/${action}"`, "i");
  for (const [row] of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    if (!decodeEntities(row).includes(`>${name}<`)) continue;
    const match = row.match(actionPattern);
    if (match) return match[1];
  }
  return "";
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
const detailPath = () => `/dashboard/positions/${ids.mainPosition}`;

// Each step: [name, run, expected]. `includes` / `excludes` are checked against the (entity-decoded) body;
// an entry (or `location`) may be a function, read when the step runs, to use an id captured earlier.
// `excludesIds` names captured ids that must not appear in the body; `requiresIds` names ids that must
// have been captured. `location` is a prefix match unless `exactLocation` is set.
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
    async () => {
      const result = await request(a, "/dashboard");
      ids.mainPosition = positionIdFor(result.body, instrument, "delete");
      return { ...result, location: ids.mainPosition ? `(position ${ids.mainPosition})` : "(position id not found)" };
    },
    {
      status: 200,
      includes: [instrument, "50.25", categoryName],
      excludes: [EMPTY_STATE],
      requiresIds: ["mainPosition"],
    },
  ],

  // Account A deletes a dedicated position, restores it, and deletes it again (FR-009).
  [
    "A: records the position to delete",
    async () => {
      const result = await request(a, "/dashboard/new", {
        method: "POST",
        form: position({ instrument: deletedInstrument, new_category_name: categoryName }),
      });
      ids.delPosition = positionIdFor((await request(a, "/dashboard")).body, deletedInstrument, "delete");
      return result;
    },
    { status: 302, location: "/dashboard", exactLocation: true, requiresIds: ["delPosition"] },
  ],
  [
    "A: deletes it",
    () => request(a, `/dashboard/positions/${ids.delPosition}/delete`, { method: "POST" }),
    { status: 302, location: () => `/dashboard?deleted=${ids.delPosition}`, exactLocation: true },
  ],
  [
    "A: dashboard shows the notice and no longer lists it",
    () => request(a, `/dashboard?deleted=${ids.delPosition}`),
    { status: 200, includes: ["Position deleted.", instrument], excludes: [deletedInstrument] },
  ],
  [
    "A: deleted page lists it",
    () => request(a, "/dashboard/deleted"),
    { status: 200, includes: [deletedInstrument, () => `/dashboard/positions/${ids.delPosition}/restore`] },
  ],
  [
    "A: deleting it again is not found",
    () => request(a, `/dashboard/positions/${ids.delPosition}/delete`, { method: "POST" }),
    { status: 404 },
  ],
  [
    "A: restores it",
    () => request(a, `/dashboard/positions/${ids.delPosition}/restore`, { method: "POST" }),
    { status: 302, location: "/dashboard", exactLocation: true },
  ],
  [
    "A: dashboard lists the restored position",
    () => request(a, "/dashboard"),
    { status: 200, includes: [deletedInstrument, instrument], excludes: ["Position deleted."] },
  ],
  [
    "A: deleted page no longer lists it",
    () => request(a, "/dashboard/deleted"),
    { status: 200, excludes: [deletedInstrument], excludesIds: ["delPosition"] },
  ],
  [
    // Left deleted for B's checks.
    "A: deletes it again",
    () => request(a, `/dashboard/positions/${ids.delPosition}/delete`, { method: "POST" }),
    { status: 302, location: () => `/dashboard?deleted=${ids.delPosition}`, exactLocation: true },
  ],

  [
    "A: form offers the new category",
    async () => {
      const result = await request(a, "/dashboard/new");
      ids.category = categoryIdFor(result.body, categoryName);
      return { ...result, location: ids.category ? `(category ${ids.category})` : "(category id not found)" };
    },
    // The name input must be in the server-rendered HTML even with categories, so "New category…" works without JS.
    { status: 200, includes: [categoryName, 'name="new_category_name"'], requiresIds: ["category"] },
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
    { status: 200, includes: [instrument, reasonText, categoryName, NO_PRICE], requiresIds: ["mainPosition"] },
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
    { status: 302, location: detailPath, exactLocation: true },
  ],
  ["A: dashboard shows the result", () => request(a, "/dashboard"), { status: 200, includes: [RESULT, "as of"] }],
  [
    "A: unknown position id returns 404",
    () => request(a, `/dashboard/positions/${randomUUID()}`),
    { status: 404, excludes: [instrument, reasonText] },
  ],
  // RLS checks only ownership, so a deleted position is hidden by the app's own `deleted_at` filters.
  [
    "A: deleted position's detail page returns 404",
    () => request(a, `/dashboard/positions/${ids.delPosition}`),
    { status: 404, excludes: [deletedInstrument], requiresIds: ["delPosition"] },
  ],
  [
    "A: cannot set a price on a deleted position",
    () =>
      request(a, `/dashboard/positions/${ids.delPosition}`, {
        method: "POST",
        form: { current_price: "60,3", price_date: todayUtc },
      }),
    { status: 404, requiresIds: ["delPosition"] },
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
    { status: 200, excludes: [categoryName], requiresIds: ["category"], excludesIds: ["category"] },
  ],
  [
    "B: cannot record a position with A's category",
    () => request(b, "/dashboard/new", { method: "POST", form: position({ category_id: ids.category }) }),
    { status: 200, includes: ["Choose a category from your list"], excludesIds: ["category"] },
  ],
  [
    "B: deleted page does not list A's deleted position",
    () => request(b, "/dashboard/deleted"),
    {
      status: 200,
      excludes: [deletedInstrument],
      requiresIds: ["delPosition"],
      excludesIds: ["delPosition", "mainPosition"],
    },
  ],
  [
    "B: cannot restore A's deleted position",
    () => request(b, `/dashboard/positions/${ids.delPosition}/restore`, { method: "POST" }),
    { status: 404 },
  ],
  [
    "B: cannot delete A's position",
    () => request(b, `/dashboard/positions/${ids.mainPosition}/delete`, { method: "POST" }),
    { status: 404, requiresIds: ["mainPosition"] },
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
    "B: unknown position id returns 404",
    async () => {
      const result = await request(b, `/dashboard/positions/${randomUUID()}`);
      unknownIdBody = result.body;
      return result;
    },
    { status: 404 },
  ],
  [
    "B: cannot open A's position",
    () => request(b, detailPath()),
    {
      status: 404,
      excludes: [instrument, reasonText],
      requiresIds: ["mainPosition"],
      excludesIds: ["category", "mainPosition"],
      sameBodyAs: () => unknownIdBody,
    },
  ],
  [
    "B: cannot set a price on A's position",
    () => request(b, detailPath(), { method: "POST", form: { current_price: "1", price_date: todayUtc } }),
    {
      status: 404,
      excludes: [instrument, reasonText],
      excludesIds: ["category", "mainPosition"],
      sameBodyAs: () => unknownIdBody,
    },
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
    "anonymous delete POST redirects to signin",
    () => request(anonymous, `/dashboard/positions/${ids.delPosition}/delete`, { method: "POST" }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "anonymous: detail page redirects to signin",
    () => request(anonymous, detailPath()),
    { status: 302, location: "/auth/signin" },
  ],
];

const resolve = (value) => (typeof value === "function" ? value() : value);

function maskIds(html) {
  return html.replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
}

function bodyProblems(actual, expected) {
  const body = decodeEntities(actual.body);
  const problems = [];
  for (const text of (expected.includes ?? []).map(resolve)) {
    if (!body.includes(text)) problems.push(`missing "${text}"`);
  }
  for (const text of (expected.excludes ?? []).map(resolve)) {
    if (body.includes(text)) problems.push(`unexpected "${text}"`);
  }
  for (const key of expected.excludesIds ?? []) {
    if (ids[key] && body.includes(ids[key])) problems.push(`unexpected A's ${ID_LABELS[key]} id`);
  }
  for (const key of expected.requiresIds ?? []) {
    if (!ids[key]) problems.push(`A's ${ID_LABELS[key]} id was not captured`);
  }
  // Ids are masked so the comparison is about the page, not about which uuid was requested.
  if (expected.sameBodyAs && maskIds(actual.body) !== maskIds(expected.sameBodyAs())) {
    problems.push("body differs from the 404 for an unknown id");
  }
  return problems;
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const problems = bodyProblems(actual, expected);
  const location = resolve(expected.location);
  const locationOk =
    location === undefined ||
    (expected.exactLocation ? actual.location === location : actual.location.startsWith(location));
  const ok = actual.status === expected.status && locationOk && problems.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${location ?? ""}`);
    for (const problem of problems) console.log(`      ${problem}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
