---
change_id: auth-email-callback
title: Fix signup email confirmation link (otp_expired / localhost:3000)
status: archived
created: 2026-10-14
updated: 2026-10-15
archived_at: 2026-10-15T08:16:07Z
---

## Notes

Plan-less bug fix; reviewed against the diff only (no `plan.md`).

**Symptom:** the signup confirmation email linked to `http://localhost:3000/?error=access_denied&error_code=otp_expired`.

**Root causes (from `docker logs supabase_auth_investments-diary`):**

- `signUp` passed no `emailRedirectTo`, and the redirect allowlist held exact URLs only, so Supabase fell back to Site URL (hosted default `http://localhost:3000`; local `http://127.0.0.1:4321/`).
- The app had no route exchanging the PKCE `?code=` for a session; landing on `/` silently dropped it, so the user clicked again and the second click hit "One-time token not found" → `otp_expired`.

**Changes:** `emailRedirectTo` → `/auth/callback` (`src/pages/api/auth/signup.ts`); new `src/pages/auth/callback.ts`; `additional_redirect_urls` wildcarded in `supabase/config.toml`.

**Manual (hosted dashboard, not in repo):** Site URL = Vercel production URL; Redirect URLs include `https://<vercel-domain>/**`.
