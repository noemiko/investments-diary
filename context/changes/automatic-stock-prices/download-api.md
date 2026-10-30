# Phase 3 API walkthrough

The dashboard buttons and listing island are integrated in Phase 4. Phase 3 exposes
these authenticated JSON POST contracts for those controls. GET requests return 405
and do not search or download. Browser calls send the normal same-origin session
cookie; no service-role key is involved. Opening a page or waiting does not download.

Use the local app at `http://127.0.0.1:4321`, sign in and open an owned, open position.
Confirm its wallet currency first. Use synthetic USD and PLN wallets/positions for
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

1. **Search metadata.** Replace `POSITION_ID` with the owned position UUID.

   ```js
   await priceAction("listings/search", { positionId: "POSITION_ID", query: "Apple" });
   ```

   Results contain at most ten stock/ETF candidates with symbol, name and exchange.
   Search supplies no price or confirmed currency and does not update valuations.
   A Polish example query is `PKO`. Distinguish the returned exchanges/symbols before
   choosing a candidate rather than matching the diary's original label automatically.

2. **Explicit Download prices for the chosen candidate.** In a USD wallet:

   ```js
   const lookup = await priceAction("listings/download", {
     positionId: "POSITION_ID",
     symbol: "AAPL",
   });
   lookup;
   ```

   A successful result includes an opaque `lookupId`, the server-validated exchange,
   currency and timezone, and a regular-session quote with separate market/fetch
   timestamps. For a PLN position use `PKO.WA`. The original diary label stays intact.
   A cross-currency candidate returns `incompatible_currency` with HTTP 409.

3. **Confirm the returned listing.** Inspect its identity first, then:

   ```js
   await priceAction("listings/confirm", {
     positionId: "POSITION_ID",
     lookupId: lookup.result.lookupId,
   });
   ```

   This reuses the saved, owner/position-bound receipt and performs no provider call.
   Receipts expire after 30 minutes. An expired/substituted receipt fails safely;
   repeat the explicit candidate download if needed. Receipt expiry does not itself
   cause any download. Do not supply browser-copied currency, exchange or price fields:
   unknown request fields are rejected, and confirmation resolves all metadata on the
   server.

4. **Explicit Download prices for mapped holdings.** All owned mapped open holdings:

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

5. **Unavailable/recoverable behavior.** A controlled provider timeout/HTTP failure
   is covered by deterministic service/SDK fixtures; do not force a real Yahoo rate
   limit. If the provider is unavailable during this manual walkthrough, expect safe
   `provider_unavailable`, `timeout` or per-listing failure results, followed by a
   cooldown. The response contains no raw provider payload, URL, cookie or crumb.
   Last valid saved quotes and manual entries remain intact. Longer Retry-After
   instructions are respected. Wait until the reported instant and explicitly retry;
   waiting alone never makes a request. Search itself can be retried explicitly.

Ordinary app result displays and the snapshot effective-price integration arrive in
Phase 4; this API walkthrough verifies listing choice, explicit download, confirmation
and recoverable errors without claiming those later views are complete.
