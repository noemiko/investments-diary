# Session survives reload

User-selected standalone risk: a valid saved session is lost across navigation or
a real SSR reload, sending the user back to sign-in.

Exemplar: `tests/e2e/seed.spec.ts`. Auth, cookies, routing, SSR and local Supabase
remain real; no boundaries are mocked.

1. Load the session produced by the setup project in an isolated browser context.
2. Open `/dashboard`: expect its URL, Your positions heading, the configured
   user's identity and Sign out button.
3. Reload the full page: expect the same protected URL, heading and identity.
4. Dispose the browser context. No business records are created or changed;
   setup-created sign-in sessions are expected, not test residue.

Review: outcome assertions include the user's identity; accessible locators only;
no dependence on another spec; state-based waits; no business data to clean up.

Deliberate break: temporarily expire Supabase auth cookies in the dashboard
response after resolving the current user. The first visit still succeeds, but
the reload must redirect to sign-in and fail the post-reload URL assertion.
Restore production source immediately after the check, then rerun green.

Verification (2026-10-23): cold-server run passed (auth setup + spec). The
cookie-expiry break passed the initial visit and failed exactly the URL assertion
after reload: expected `/dashboard`, received `/auth/signin`. Middleware was
restored byte-for-byte. Both runs perform no business writes; only expected auth
setup sessions are created. No application-record residue is possible in this
read-only flow.
