<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Email confirmation callback fix

- **Plan**: none (plan-less review of uncommitted diff)
- **Scope**: Full diff — `src/pages/api/auth/signup.ts`, `src/pages/auth/callback.ts`, `supabase/config.toml`
- **Reviewed phases**: none
- **Date**: 2026-10-14
- **Verdict**: REJECTED
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | N/A |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

## Findings

### F1 — Local test toggle would break CI smoke

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/config.toml:209
- **Detail**: `enable_confirmations = true` left in the working tree. Smoke step "signin accepts correct password" (scripts/smoke.mjs:106) signs in right after signup expecting 302 → `/`; with confirmations on Supabase rejects it with "Email not confirmed". CI `smoke` uses this config.
- **Fix**: Revert to `false` before committing; keep the `/**` redirect-URL change on line 156.
- **Decision**: FIXED — enable_confirmations reverted to false

### F2 — Successful confirmation lands on "Check your email"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/callback.ts:17
- **Detail**: Success redirects to `/auth/confirm-email`, which in production says "We've sent a confirmation link… Click it" (confirm-email.astro:15-16) — the step just completed. The user is already signed in after the exchange.
- **Fix**: Redirect to `/dashboard` on success.
- **Decision**: FIXED — success redirects to /dashboard

### F3 — Failed confirmations go to sign-up instead of sign-in

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/callback.ts:11, :17
- **Detail**: Both failure branches go to `/auth/signup`. In the common failure cases (link reused, mail scanner pre-click, opened on another device without the PKCE verifier cookie) the email is already confirmed, so signing up again fails with "User already registered".
- **Fix**: Route both failure branches to `/auth/signin?error=…` with a message such as "This link was already used or has expired. Try signing in; if that fails, sign up again."
  - Strength: Correct for the observed case; sign-in succeeds whenever the email is confirmed.
  - Tradeoff: A genuinely unconfirmed user needs one extra hop to sign-up.
  - Confidence: HIGH — auth logs show the confirmed-then-reused case.
  - Blind spot: No "resend confirmation" action exists; that is the complete fix but new scope.
- **Decision**: FIXED — both failures redirect to /auth/signin with an explanatory message

### F4 — Lint fails, so pre-commit blocks the commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/auth/callback.ts:17-19
- **Detail**: eslint: 2 `prettier/prettier` errors (line 17 over 120 chars; line 18 missing semicolon + trailing blank line). `.husky/pre-commit` runs `npm run lint`. `astro check` passes.
- **Fix**: `npx prettier --write src/pages/auth/callback.ts`
- **Decision**: FIXED — prettier applied; eslint clean, astro check 0 errors

### F5 — Production setup and test coverage aren't in the repo

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: N/A (hosted Supabase dashboard; scripts/smoke.mjs)
- **Detail**: Production depends on manual dashboard settings (Site URL, Redirect URLs `https://<vercel>/**`) recorded nowhere in the repo. `emailRedirectTo` uses request origin, so preview deploys need their domain allowlisted or fall back to Site URL and lose `?code=` on `/`. No test exercises `/auth/callback`.
- **Fix**: Add a short note to `context/deployment/deploy-plan.md` listing the two dashboard settings.
- **Decision**: FIXED — deploy-plan.md: B2 logged as not done in execution log; B2 row explains the /** + /auth/callback dependency (step itself was already planned)
