# Phase 3 API walkthrough

The dashboard **Download prices** button is integrated in Phase 4. Phase 3 exposes
this authenticated JSON POST contract for it. GET requests return 405
and do not search or download. Browser calls send the normal same-origin session
cookie; no service-role key is involved. Opening a page or waiting does not download.

Use the local app at `http://127.0.0.1:4321`, sign in and note an owned, open position UUID.
Existing wallets without a previous denomination use USD; new wallets choose USD, PLN or EUR. Use synthetic USD and PLN wallets/positions for
this walkthrough if the existing diary does not contain both denominations.

In browser developer tools, define this helper. Each invocation below is an explicit
action; do not put it in a timer, effect, reload handler or snapshot job.

```js
async function priceAction(path, body) {
  const response = await fetch(`/dashboard/market-prices/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, result: await response.json() };
}
```

1. **Existing-position listing changes are retired.** A holding's stock identity is its
   creation-time selection; it cannot be searched for, re-downloaded under another
   symbol or confirmed as a different listing. The former routes remain only to give
   stale clients a clear answer:

   ```js
   await priceAction("listings/search", { positionId: "POSITION_ID", query: "Apple" });
   await priceAction("listings/download", { positionId: "POSITION_ID", symbol: "AAPL" });
   await priceAction("listings/confirm", { positionId: "POSITION_ID", lookupId: "LOOKUP_ID" });
   ```

   Each returns HTTP 409 `{ ok: false, reason: "selection_already_set" }` after the
   usual sign-in and same-origin checks, without reading the body or calling the
   provider. The database functions behind the former flow
   (`claim_listing_lookup`, `finish_listing_lookup`, `confirm_listing_lookup`) are not
   executable by signed-in users either (`20261102130000_retire_listing_lookup_rpcs.sql`),
   so direct PostgREST calls are refused too. A holding with the wrong stock is deleted
   and recreated with the right selection. Investments saved before selections existed were assigned Apple
   (`AAPL`/`NMS`) by owner decision on 2026-11-02; holdings that already had a
   confirmed listing kept a selection matching it.

2. **Explicit Download prices for selected holdings.** All owned open holdings (every holding has a selection):

   ```js
   await priceAction("download", {});
   ```

   Or select up to 50 position UUIDs in one request:

   ```js
   await priceAction("download", { positionIds: ["POSITION_ID"] });
   ```

   Each click is eligible even immediately after a successful click. Distinct cache
   identities are deduplicated, and provider batches contain at most 50 symbols.
   A shared five-second provider budget bounds sequential work. A concurrent claim
   reports `refreshing`; a failed attempt reports its retry cooldown. Unattempted
   symbols report `due` and are left eligible for a later explicit click.

   A newly saved search selection is resolved on this click, without a second
   confirmation action. Returned symbol/exchange/type and verified currency/timezone
   must match the selected identity and wallet before a price is applied. A shared
   selection is fetched once; matching wallets can receive its price while mismatched
   wallets retain their manual values and report `incompatible_currency`. Search metadata
   is never used to invent a quote denomination.

3. **Unavailable/recoverable behavior.** A controlled provider timeout/HTTP failure
   is covered by deterministic service/SDK fixtures; do not force a real Yahoo rate
   limit. If the provider is unavailable during this manual walkthrough, expect safe
   `provider_unavailable`, `timeout` or per-listing failure results, followed by a
   cooldown. The response contains no raw provider payload, URL, cookie or crumb.
   Last valid saved quotes and manual entries remain intact. Longer Retry-After
   instructions are respected. Wait until the reported instant and explicitly retry;
   waiting alone never makes a request.

## New-investment creation

Phase 4's native `POST /dashboard/new` supports `action=search_listing`, a
`select_listing=<opaque receipt UUID>` button, and `action=save`. These actions use
the signed-in same-origin session and preserve the other entry fields. Search sends
only the explicit company/symbol query to Yahoo; Select and Save read persisted
owner/wallet-bound metadata without provider calls. Save derives the instrument
from that selection and rejects missing, foreign, expired or wallet-mismatched
choices before creating a category or position. Unsaved choices expire after
30 minutes; saved holdings retain their durable target afterward. A later dashboard
**Download prices** resolves the verified quote as described above. Opening the form,
searching, selecting, saving, reloading and snapshot capture never download quotes.
