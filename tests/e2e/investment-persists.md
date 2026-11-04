# Investment persists

User-selected risk: the investment submitted through the real form disappears
from the dashboard after navigation or reload. Seed: `tests/e2e/seed.spec.ts`.

1. Create a disposable local user for each variant and authenticate through the
   real sign-in endpoint. Prepare a uniquely named wallet/category under that user;
   keep auth, routing, DB and SSR real. Separate users prevent concurrent writes
   from shifting another variant's paginated dashboard reads.
2. Seed a unique owner/wallet-bound listing-choice receipt as the provider-metadata
   boundary. POST its actual native Select action to `/dashboard/new`, then display
   that real SSR response in the browser. Keep unfinished price and other draft fields.
   Run both hydrated and JavaScript-disabled browser variants; fill price 50.25,
   keeping date 2026-01-15, quantity 2 and the fixture wallet/category.
3. Save once; expect `/dashboard` and exactly one matching row with price/quantity.
4. Reload; expect the same row and submitted price, quantity and date.
5. Verify the saved position references its durable target, has no canonical quote
   or current price, exposes the explicit download action and made no download POST.
6. In `finally`, physically delete only fixture positions, receipts, target, category
   and wallet through the local admin client, then assert no residue. The app has no
   hard-delete flow. Admin access seeds metadata and cleans fixtures; wallet/category
   inserts use the real user's RLS, and selection/save/read behavior uses the app.

Review: risk-specific row assertions, accessible locators, independent unique
fixtures, state-based waits and asserted cleanup on success/failure. Provider metadata
is deterministic; the browser receives the actual native selection response rather
than depending on live Yahoo availability. Native search/provider separation is also
covered by the new-position page and database/service tests.

Deliberate break: change the real form handler to report success and redirect
without saving the position. The test must fail on the missing investment row,
while auth and submission navigation still succeed. Restore the handler and
rerun green. Cleanup verifies all three tables after each run.

Historical verification (2026-10-23, before mandatory Yahoo selection): first cold-server run passed (setup + spec). The
redirect-without-save break failed on the missing row (expected 1, received 0),
after login and the dashboard redirect succeeded. The form handler was restored
byte-for-byte. Cleanup queries passed for positions, reason_categories and wallets
on both the green run and the deliberate-break run. Exploration fixtures were also
physically removed with empty-table-result assertions scoped to their token.
