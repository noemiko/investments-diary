# Implementation review fixes

Source: `../reviews/impl-review.md`, phases 1–3, 2026-10-26.

- [x] F1: Resolve local release from the configuration directory; tolerate
      unavailable Git with `local-unknown`; preserve configured Vercel release.
      User approved and implemented on 2026-10-26. Added three config-load regression
      tests, proved failures against the old implementation and a precedence
      mutation, and passed the parent-directory Astro invocation, full Vitest
      (220 tests), required static/build sequence and public artifact inspection.
- [x] F2: Classify `email_address_invalid` and `validation_failed` as expected
      auth validation. User approved and implemented on 2026-10-26. Four new
      classifier/signup-handler regression tests failed before the fix and passed
      afterwards. Existing retry/network, 5xx and unknown-code checks remain green.
      Full Vitest (224 tests), required static/build sequence, public artifact
      inspection and local Supabase HTTP smoke all passed.

Manual plan criteria remain open; these fixes do not establish hosted Sentry
delivery, source-map upload or email alert activation.
