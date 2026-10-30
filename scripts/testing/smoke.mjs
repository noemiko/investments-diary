// Smoke test: proves the Supabase auth flow still works end-to-end over HTTP (redirects, cookies, gating),
// that a deleted position can be restored, that the new-investment form confronts the author with their
// same-category positions (server-rendered part only; the live reveal needs JS), that a wallet counts its
// positions (FR-013), and that one account cannot see, borrow, delete or restore another account's diary data.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/testing/smoke.mjs
// Creates two accounts per run — never point it at production.

import { randomBytes, randomUUID } from "node:crypto";

const smokeUrl = new URL(process.env.BASE_URL ?? "http://localhost:4321");
if (smokeUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(smokeUrl.hostname)) {
  throw new Error("Account-creating smoke tests require a local HTTP server");
}
const BASE_URL = smokeUrl.origin;
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
const walletName = `Smoke wallet ${runId}`;
const reasonText = "Smoke walk reason";
// Run-unique, so its absence from a page proves the deleted filter rather than a coincidence.
const deletedReasonText = `Deleted position reason ${runId}`;

// Ids captured from A's pages, so later steps can target them and check B never sees them.
const ids = {
  secondWallet: "",
  pricedPosition: "",
  openPosition: "",
  wallet: "",
  bWallet: "",
  category: "",
  mainPosition: "",
  delPosition: "",
};
const ID_LABELS = {
  secondWallet: "second wallet",
  pricedPosition: "priced investment",
  openPosition: "open investment",
  wallet: "wallet",
  bWallet: "B's own wallet",
  category: "category",
  mainPosition: "main position",
  delPosition: "position to delete",
};
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

// Each wallet row links to `/dashboard/wallets/<id>` with the wallet's name as the link text.
function walletIdFor(html, name) {
  for (const [, id, text] of html.matchAll(/href="\/dashboard\/wallets\/([0-9a-f-]{36})"[^>]*>\s*([^<]*?)\s*<\/a>/gi)) {
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
    // A's wallet by default; B's steps pass their own, so a rejection is never about the wallet by accident.
    wallet_id: ids.wallet,
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
// The app's own not-found heading; Astro's routing 404 says "404: Not found", so a wrong path cannot pass.
const NOT_FOUND = "Position not found";
const detailPath = () => `/dashboard/positions/${ids.mainPosition}`;
// Island props carry every non-deleted reason whatever category is chosen, so only these attributes,
// emitted by the rendered panel, prove which positions the confrontation shows.
const CONFRONTATION_HISTORY = 'data-confrontation="history"';
const CONFRONTATION_EMPTY = "data-confrontation-empty";
const CONFRONTATION_ITEM = "data-confrontation-position-id";
const confronts = (key) => () => `${CONFRONTATION_ITEM}="${ids[key]}"`;
// An empty instrument is rejected, so the form re-renders (no JS) with the submitted category kept.
const rejectedEntry = (overrides) => position({ instrument: "", ...overrides });
const pricedPath = () => `/dashboard/positions/${ids.pricedPosition}`;
const closeForm = (overrides = {}) => ({
  action: "close",
  sell_price: "55",
  sell_date: yesterdayUtc,
  acknowledgement: "on",
  ...overrides,
});
const soldDateLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
  new Date(`${yesterdayUtc}T00:00:00Z`),
);
function recordBody(result, id, history = false) {
  const pattern = history ? /<li\b[^>]*>[\s\S]*?<\/li>/g : /<tr\b[^>]*>[\s\S]*?<\/tr>/g;
  const marker = history ? `data-confrontation-position-id="${id}"` : `href="/dashboard/positions/${id}"`;
  const record = [...result.body.matchAll(pattern)].find(([html]) => html.includes(marker))?.[0];
  if (!record) throw new Error("Expected result record missing");
  return { ...result, body: record };
}

// Each step: [name, run, expected]. `includes` / `excludes` are checked against the (entity-decoded) body;
// an entry (or `location`) may be a function, read when the step runs, to use an id captured earlier.
// `excludesIds` names captured ids that must not appear in the body; `requiresIds` names ids that must
// have been captured. `location` is a prefix match unless `exactLocation` is set.
const steps = [
  ...["/dashboard/wallets", "/dashboard/wallets/new", `/dashboard/wallets/${randomUUID()}`].flatMap((path) => [
    [`anonymous wallet GET ${path}`, () => request(anonymous, path), { status: 302, location: "/auth/signin" }],
    [
      `anonymous wallet POST ${path}`,
      () =>
        request(anonymous, path, {
          method: "POST",
          form: { currency: "USD", currency_attested: "on", name: "Forbidden", starting_value: "0" },
        }),
      { status: 302, location: "/auth/signin" },
    ],
  ]),
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
    "A: creates a wallet (FR-013)",
    () =>
      request(a, "/dashboard/wallets/new", {
        method: "POST",
        form: { currency: "USD", currency_attested: "on", name: walletName, starting_value: "1 000,50" },
      }),
    { status: 302, location: "/dashboard/wallets", exactLocation: true },
  ],
  [
    "A: wallets page lists it with its starting value",
    async () => {
      const result = await request(a, "/dashboard/wallets");
      ids.wallet = walletIdFor(result.body, walletName);
      return result;
    },
    { status: 200, includes: [walletName, "1,000.50", "No counted results"], requiresIds: ["wallet"] },
  ],
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
        form: position({
          instrument: deletedInstrument,
          new_category_name: categoryName,
          reason_text: deletedReasonText,
        }),
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
    { status: 404, includes: [NOT_FOUND], requiresIds: ["delPosition"] },
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

  // Confrontation (US-01, FR-012): the re-rendered form shows the category's earlier positions, minus
  // the deleted one, whose reason must not reach the page at all.
  [
    "A: confrontation shows the category's earlier position, not the deleted one",
    () => request(a, "/dashboard/new", { method: "POST", form: rejectedEntry({ category_id: ids.category }) }),
    {
      status: 200,
      includes: ["Enter the instrument", CONFRONTATION_HISTORY, confronts("mainPosition")],
      excludes: [CONFRONTATION_EMPTY, confronts("delPosition"), deletedReasonText],
      requiresIds: ["category", "mainPosition", "delPosition"],
    },
  ],
  [
    // `createPosition` trims and matches the typed name case-insensitively, so the panel must too.
    "A: confrontation matches a typed existing category name",
    () =>
      request(a, "/dashboard/new", {
        method: "POST",
        form: rejectedEntry({ category_id: "__new__", new_category_name: ` ${categoryName.toUpperCase()} ` }),
      }),
    {
      status: 200,
      includes: [
        CONFRONTATION_HISTORY,
        confronts("mainPosition"),
        "already exists, so this investment will be filed under it",
      ],
      excludes: [CONFRONTATION_EMPTY],
      requiresIds: ["mainPosition"],
    },
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
    { status: 303, location: detailPath, exactLocation: true },
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
    { status: 404, includes: [NOT_FOUND], requiresIds: ["delPosition"] },
  ],
  // The same detail page opens once restored, so the two 404s above come from the `deleted_at` filter.
  [
    "A: restores the deleted position again",
    () => request(a, `/dashboard/positions/${ids.delPosition}/restore`, { method: "POST" }),
    { status: 302, location: "/dashboard", exactLocation: true, requiresIds: ["delPosition"] },
  ],
  [
    "A: restored position's detail page opens",
    () => request(a, `/dashboard/positions/${ids.delPosition}`),
    { status: 200, includes: [deletedInstrument], requiresIds: ["delPosition"] },
  ],
  [
    "A: confrontation shows the restored position again",
    () => request(a, "/dashboard/new", { method: "POST", form: rejectedEntry({ category_id: ids.category }) }),
    {
      status: 200,
      includes: [confronts("mainPosition"), confronts("delPosition"), deletedReasonText],
      requiresIds: ["category", "mainPosition", "delPosition"],
    },
  ],
  [
    // Left deleted again for B's checks.
    "A: deletes it once more",
    () => request(a, `/dashboard/positions/${ids.delPosition}/delete`, { method: "POST" }),
    { status: 302, location: () => `/dashboard?deleted=${ids.delPosition}`, exactLocation: true },
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
    "B: form does not offer A's category or wallet",
    () => request(b, "/dashboard/new"),
    {
      status: 200,
      excludes: [categoryName, walletName],
      requiresIds: ["category", "wallet"],
      excludesIds: ["category", "wallet"],
    },
  ],
  [
    "B: wallets page does not list A's wallet",
    () => request(b, "/dashboard/wallets"),
    { status: 200, excludes: [walletName], requiresIds: ["wallet"], excludesIds: ["wallet"] },
  ],
  [
    "B: cannot open A's wallet",
    () => request(b, `/dashboard/wallets/${ids.wallet}`),
    { status: 404, includes: ["Wallet not found"], excludes: [walletName], requiresIds: ["wallet"] },
  ],
  [
    "B: cannot rename A's wallet",
    () =>
      request(b, `/dashboard/wallets/${ids.wallet}`, {
        method: "POST",
        form: { currency: "USD", currency_attested: "on", name: "Taken", starting_value: "0" },
      }),
    { status: 404, includes: ["Wallet not found"], requiresIds: ["wallet"] },
  ],
  [
    "B: creates its own wallet",
    async () => {
      const result = await request(b, "/dashboard/wallets/new", {
        method: "POST",
        form: { currency: "USD", currency_attested: "on", name: `B ${walletName}`, starting_value: "0" },
      });
      ids.bWallet = walletIdFor((await request(b, "/dashboard/wallets")).body, `B ${walletName}`);
      return result;
    },
    { status: 302, location: "/dashboard/wallets", exactLocation: true, requiresIds: ["bWallet"] },
  ],
  [
    "B: cannot record a position into A's wallet",
    () =>
      request(b, "/dashboard/new", {
        method: "POST",
        form: position({ wallet_id: ids.wallet, new_category_name: `B ${categoryName}` }),
      }),
    { status: 200, includes: ["Choose a wallet from your list"], excludesIds: ["wallet"] },
  ],
  [
    // Every reason the author wrote is serialised into this page's island props, so this is the privacy line.
    "B: form carries none of A's reasons or positions",
    () => request(b, "/dashboard/new"),
    {
      status: 200,
      excludes: [reasonText, deletedReasonText, CONFRONTATION_ITEM],
      requiresIds: ["mainPosition", "delPosition"],
      excludesIds: ["mainPosition", "delPosition"],
    },
  ],
  [
    // B typing A's exact category name has nothing to match: B's categories are B's own.
    "B: confrontation for A's category name is empty",
    () =>
      request(b, "/dashboard/new", {
        method: "POST",
        form: rejectedEntry({
          wallet_id: ids.bWallet,
          category_id: "__new__",
          new_category_name: categoryName,
          reason_text: "",
        }),
      }),
    {
      status: 200,
      includes: [CONFRONTATION_HISTORY, CONFRONTATION_EMPTY],
      excludes: [CONFRONTATION_ITEM, reasonText, deletedReasonText, "already exists"],
      excludesIds: ["mainPosition", "delPosition", "category"],
    },
  ],
  [
    "B: cannot record a position with A's category",
    () =>
      request(b, "/dashboard/new", {
        method: "POST",
        form: position({ wallet_id: ids.bWallet, category_id: ids.category }),
      }),
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
    { status: 404, includes: [NOT_FOUND], requiresIds: ["delPosition"] },
  ],
  [
    "B: cannot delete A's position",
    () => request(b, `/dashboard/positions/${ids.mainPosition}/delete`, { method: "POST" }),
    { status: 404, includes: [NOT_FOUND], requiresIds: ["mainPosition"] },
  ],
  [
    "B: rejects a future buy date",
    () =>
      request(b, "/dashboard/new", {
        method: "POST",
        form: position({ wallet_id: ids.bWallet, buy_date: tomorrowUtc, new_category_name: `B ${categoryName}` }),
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
    "B: cannot close A's position and sees the same missing-id page",
    () => request(b, detailPath(), { method: "POST", form: closeForm({ sell_date: todayUtc }) }),
    { status: 404, excludes: [instrument, reasonText], sameBodyAs: () => unknownIdBody },
  ],
  [
    "B: signout clears session",
    () => request(b, "/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],

  // A's price and A's delete state are unchanged by B's attempts.
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
    // Main has no quantity; the no-JS entry has no price. Both are excluded; deleted entries are absent.
    "A: wallet leaves the position without quantity out of its value",
    () => request(a, "/dashboard/wallets"),
    { status: 200, includes: [walletName, "1,000.50", 'data-wallet-not-counted="2"', "No counted results"] },
  ],
  [
    "A: deleted position is still deleted",
    () => request(a, "/dashboard/deleted"),
    { status: 200, includes: [deletedInstrument], requiresIds: ["delPosition"] },
  ],
  [
    "A: rejects a duplicate wallet name ignoring case and retains values",
    () =>
      request(a, "/dashboard/wallets/new", {
        method: "POST",
        form: { currency: "USD", currency_attested: "on", name: walletName.toUpperCase(), starting_value: "25" },
      }),
    { status: 200, includes: ["You already have a wallet with this name", walletName.toUpperCase(), 'value="25"'] },
  ],
  [
    "A: creates a second wallet",
    async () => {
      const result = await request(a, "/dashboard/wallets/new", {
        method: "POST",
        form: { currency: "USD", currency_attested: "on", name: `Second ${walletName}`, starting_value: "1000" },
      });
      ids.secondWallet = walletIdFor((await request(a, "/dashboard/wallets")).body, `Second ${walletName}`);
      return result;
    },
    { status: 302, location: "/dashboard/wallets", exactLocation: true, requiresIds: ["secondWallet"] },
  ],
  [
    "A: records a priced-wallet investment",
    async () => {
      const result = await request(a, "/dashboard/new", {
        method: "POST",
        form: position({
          instrument: `PRICED-${runId}`,
          buy_date: yesterdayUtc,
          wallet_id: ids.secondWallet,
          buy_price: "50",
          quantity: "10",
          category_id: ids.category,
        }),
      });
      ids.pricedPosition = positionIdFor((await request(a, "/dashboard")).body, `PRICED-${runId}`, "delete");
      return result;
    },
    { status: 302, location: "/dashboard", exactLocation: true, requiresIds: ["pricedPosition"] },
  ],
  [
    "A: sets the priced-wallet investment's price",
    () =>
      request(a, `/dashboard/positions/${ids.pricedPosition}`, {
        method: "POST",
        form: { current_price: "60", price_date: todayUtc },
      }),
    { status: 303, location: () => `/dashboard/positions/${ids.pricedPosition}`, exactLocation: true },
  ],
  [
    "A: wallet total and members agree: 1000 + (60 - 50) * 10 = 1100",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    {
      status: 200,
      includes: [
        'data-wallet-value="1,100.00"',
        `PRICED-${runId}`,
        categoryName,
        "as of",
        () => `/dashboard/positions/${ids.pricedPosition}`,
      ],
      excludes: [instrument, deletedInstrument],
    },
  ],
  [
    "A: first wallet excludes the second wallet's investment",
    () => request(a, `/dashboard/wallets/${ids.wallet}`),
    { status: 200, includes: [instrument, walletName], excludes: [`PRICED-${runId}`, deletedInstrument] },
  ],
  [
    "A: dashboard links to the investment's wallet",
    () => request(a, "/dashboard"),
    { status: 200, includes: [() => `/dashboard/wallets/${ids.secondWallet}`, `Second ${walletName}`] },
  ],
  [
    "A: position detail links to its wallet",
    () => request(a, `/dashboard/positions/${ids.pricedPosition}`),
    { status: 200, includes: [() => `/dashboard/wallets/${ids.secondWallet}`, `Second ${walletName}`] },
  ],
  [
    "A: rejects invalid edits and retains entered values",
    () =>
      request(a, `/dashboard/wallets/${ids.secondWallet}`, {
        method: "POST",
        form: { currency: "USD", currency_attested: "on", name: "Pending rename", starting_value: "-1" },
      }),
    {
      status: 200,
      includes: ['value="Pending rename"', 'value="-1"', "Enter a number like 50.25", 'data-wallet-value="1,100.00"'],
    },
  ],
  [
    "A: edits wallet name and starting value",
    () =>
      request(a, `/dashboard/wallets/${ids.secondWallet}`, {
        method: "POST",
        form: { currency: "USD", currency_attested: "on", name: `Renamed ${walletName}`, starting_value: "2000" },
      }),
    { status: 302, location: "/dashboard/wallets", exactLocation: true },
  ],
  [
    "A: edited wallet recomputes total",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    { status: 200, includes: [`Renamed ${walletName}`, 'data-wallet-value="2,100.00"'] },
  ],
  [
    "A: investment detail reflects renamed wallet",
    () => request(a, `/dashboard/positions/${ids.pricedPosition}`),
    { status: 200, includes: [`Renamed ${walletName}`], excludes: [`Second ${walletName}`] },
  ],
  [
    "A: confrontation still spans wallets",
    () => request(a, "/dashboard/new", { method: "POST", form: rejectedEntry({ category_id: ids.category }) }),
    { status: 200, includes: [confronts("mainPosition"), confronts("pricedPosition")] },
  ],
  [
    "A: deletes the priced investment",
    () => request(a, `/dashboard/positions/${ids.pricedPosition}/delete`, { method: "POST" }),
    { status: 302, location: () => `/dashboard?deleted=${ids.pricedPosition}`, exactLocation: true },
  ],
  [
    "A: deletion removes member and its gain from total",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    {
      status: 200,
      includes: ['data-wallet-value="2,000.00"', "No counted results", "No investments in this wallet yet."],
      excludes: [`PRICED-${runId}`],
    },
  ],
  [
    "A: restores the priced investment",
    () => request(a, `/dashboard/positions/${ids.pricedPosition}/restore`, { method: "POST" }),
    { status: 302, location: "/dashboard", exactLocation: true },
  ],
  [
    "A: restoration returns member and its gain to the same wallet",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    { status: 200, includes: ['data-wallet-value="2,100.00"', `PRICED-${runId}`] },
  ],
  // Full close acceptance: sale is older than its retained quote, so stale quote leakage is visible.
  [
    "A: close rejects absent acknowledgement and preserves values",
    () => request(a, pricedPath(), { method: "POST", form: closeForm({ acknowledgement: "" }) }),
    { status: 200, includes: ["Confirm that you are closing the entire position", 'value="55"'] },
  ],
  [
    "A: closes the entire position and receives a redirect",
    () => request(a, pricedPath(), { method: "POST", form: closeForm() }),
    { status: 303, location: pricedPath, exactLocation: true },
  ],
  [
    "A: follows close redirect and sees persisted sale facts",
    () => request(a, pricedPath()),
    {
      status: 200,
      includes: ["Closed", "Final +10.00%", "· sold", soldDateLabel, "Sell price", "55", "Sell date"],
      excludes: ['name="current_price"', 'name="sell_price"', "Currently"],
    },
  ],
  [
    "A: reloading closed detail keeps its final result",
    () => request(a, pricedPath()),
    { status: 200, includes: ["Final +10.00%", soldDateLabel], excludes: ["Final +20.00%"] },
  ],
  [
    "A: dashboard row uses final sale rather than retained quote",
    async () => recordBody(await request(a, "/dashboard"), ids.pricedPosition),
    { status: 200, includes: ["Closed", "Final +10.00%", "· sold", soldDateLabel], excludes: ["+20.00%", "as of"] },
  ],
  [
    "A: wallet member uses the same final result",
    async () => recordBody(await request(a, `/dashboard/wallets/${ids.secondWallet}`), ids.pricedPosition),
    { status: 200, includes: ["Closed", "Final +10.00%", soldDateLabel], excludes: ["+20.00%", "as of"] },
  ],
  [
    "A: same-reason history retains the closed sale result",
    async () =>
      recordBody(
        await request(a, "/dashboard/new", { method: "POST", form: rejectedEntry({ category_id: ids.category }) }),
        ids.pricedPosition,
        true,
      ),
    { status: 200, includes: ["Closed", "Final +10.00%", soldDateLabel], excludes: ["+20.00%", "as of"] },
  ],
  [
    "A: realised-only wallet totals the sale gain of 50",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    {
      status: 200,
      includes: ['data-wallet-value="2,050.00"', "Realised results only"],
      excludes: ["Open prices as of"],
    },
  ],
  [
    "A: repeat close cannot replace the first saved sale",
    () => request(a, pricedPath(), { method: "POST", form: closeForm({ sell_price: "0", sell_date: todayUtc }) }),
    { status: 200, includes: ["already closed", "Final +10.00%", soldDateLabel], excludes: ["Final -100.00%"] },
  ],
  [
    "A: stale price form cannot reprice a closed sale",
    () => request(a, pricedPath(), { method: "POST", form: { current_price: "999", price_date: todayUtc } }),
    { status: 200, includes: ["already closed", "Final +10.00%", soldDateLabel], excludes: ['name="current_price"'] },
  ],
  [
    "A: records an open gain alongside the closed position",
    async () => {
      const result = await request(a, "/dashboard/new", {
        method: "POST",
        form: position({
          instrument: `OPEN-${runId}`,
          wallet_id: ids.secondWallet,
          category_id: ids.category,
          buy_price: "10",
          quantity: "20",
        }),
      });
      ids.openPosition = positionIdFor((await request(a, "/dashboard")).body, `OPEN-${runId}`, "delete");
      return result;
    },
    { status: 302, location: "/dashboard", requiresIds: ["openPosition"] },
  ],
  [
    "A: prices the open contribution at 12",
    () =>
      request(a, `/dashboard/positions/${ids.openPosition}`, {
        method: "POST",
        form: { current_price: "12", price_date: todayUtc },
      }),
    { status: 303, location: () => `/dashboard/positions/${ids.openPosition}`, exactLocation: true },
  ],
  [
    "A: mixed wallet counts realised 50 plus open 40 with open quote freshness",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    { status: 200, includes: ['data-wallet-value="2,090.00"', "Open prices as of", "Includes realised gains/losses"] },
  ],
  [
    "A: deletes the closed position",
    () => request(a, `${pricedPath()}/delete`, { method: "POST" }),
    { status: 302, location: () => `/dashboard?deleted=${ids.pricedPosition}`, exactLocation: true },
  ],
  [
    "A: closed deletion removes only realised gain and the closed member",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    {
      status: 200,
      includes: ['data-wallet-value="2,040.00"', `OPEN-${runId}`],
      excludes: [`PRICED-${runId}`, "Includes realised gains/losses"],
    },
  ],
  [
    "A: deleted closed position leaves same-reason history",
    () => request(a, "/dashboard/new", { method: "POST", form: rejectedEntry({ category_id: ids.category }) }),
    { status: 200, excludes: [confronts("pricedPosition")], includes: [confronts("openPosition")] },
  ],
  [
    "A: restores the closed position",
    () => request(a, `${pricedPath()}/restore`, { method: "POST" }),
    { status: 302, location: "/dashboard", exactLocation: true },
  ],
  [
    "A: restored sale retains its price, date and final result",
    () => request(a, pricedPath()),
    {
      status: 200,
      includes: ["Final +10.00%", "Sell price", "55", soldDateLabel],
      excludes: ['name="current_price"', 'name="sell_price"'],
    },
  ],
  [
    "A: restoration reinstates realised gain in mixed wallet",
    () => request(a, `/dashboard/wallets/${ids.secondWallet}`),
    {
      status: 200,
      includes: ['data-wallet-value="2,090.00"', "Includes realised gains/losses", `PRICED-${runId}`, `OPEN-${runId}`],
    },
  ],
  [
    "A: restored closed result returns to same-reason history",
    async () =>
      recordBody(
        await request(a, "/dashboard/new", { method: "POST", form: rejectedEntry({ category_id: ids.category }) }),
        ids.pricedPosition,
        true,
      ),
    { status: 200, includes: ["Final +10.00%", soldDateLabel] },
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
    { status: 302, location: "/auth/signin", requiresIds: ["delPosition"] },
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
