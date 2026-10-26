# Investment persists

User-selected risk: the investment submitted through the real form disappears
from the dashboard after navigation or reload. Seed: `tests/e2e/seed.spec.ts`.

1. Prepare a uniquely named wallet/category under the local E2E user. Use the
   setup project's saved session; keep auth, routing, DB and SSR real.
2. Open `/dashboard/new`, wait for Astro hydration, fill the unique instrument,
   price 50.25, date 2026-01-15, quantity 2, and select the fixture wallet/category.
3. Save once; expect `/dashboard` and exactly one matching row with price/quantity.
4. Reload; expect the same row and submitted price, quantity and date.
5. In `finally`, physically delete the token's positions, category and wallet
   through the local admin client, then query each table and assert no residue.
   The app has no hard-delete flow. Admin access is limited to fixture cleanup;
   fixture inserts use the real user's RLS, and the investment uses the UI.

Review: risk-specific row assertions, accessible locators, independent unique
fixtures, state-based waits and asserted cleanup on success/failure. No mocks.

Deliberate break: change the real form handler to report success and redirect
without saving the position. The test must fail on the missing investment row,
while auth and submission navigation still succeed. Restore the handler and
rerun green. Cleanup verifies all three tables after each run.

Verification (2026-10-23): first cold-server run passed (setup + spec). The
redirect-without-save break failed on the missing row (expected 1, received 0),
after login and the dashboard redirect succeeded. The form handler was restored
byte-for-byte. Cleanup queries passed for positions, reason_categories and wallets
on both the green run and the deliberate-break run. Exploration fixtures were also
physically removed with empty-table-result assertions scoped to their token.
