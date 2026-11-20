# Investment Diary login page — Implementation Plan

## Overview

Implement the agreed login redesign as a refinement of FR-001 and existing access-control behavior. Retain FR-002 signout and owner-created accounts. Replace the starter card with a polished responsive fintech login while preserving real Supabase authentication.

## Current State Analysis

The app uses Astro SSR, React islands, Tailwind and cookie-backed Supabase authentication. Login works through a native form POST. The current page uses purple accents, exposes provider error messages and always redirects to the dashboard. Existing form helpers lack linked error descriptions and reliable native-POST pending state.

## Desired End State

A dark navy page with emerald accents presents branding and an illustrative portfolio on the left, with an accessible login form on the right. Successful login restores a safe dashboard destination. Authentication errors remain generic, and sessions stay server-managed. Login works with keyboard and without JavaScript.

### Key Discoveries

- `src/pages/auth/signin.astro:9` renders a centered glass card.
- `src/components/auth/SignInForm.tsx:43` uses native POST authentication; retain this contract.
- `src/pages/api/auth/signin.ts:15` exposes raw provider errors.
- `src/middleware.ts:24` discards the requested destination.
- `src/layouts/Layout.astro:12` fixes the application to dark mode.
- `context/foundation/prd.md:98` explicitly closes public signup.
- Installed Supabase SSR defaults do not enable HttpOnly or explicitly require Secure cookies.
- Installed Astro supplies form-origin checking; preserve and test it.

## What We're NOT Doing

Password recovery, public registration, OAuth, remember-me controls, light-mode support, dashboard restyling, database changes and cloud deployment. Omit unsupported links and controls rather than presenting inactive affordances.

## Implementation Approach

Keep `/auth/signin` and `/api/auth/signin` as the public routes. Use Astro for static branding and the illustrative dashboard, retaining one React island for the interactive form. Scope presentation changes to the login container and reuse existing components and semantic tokens. Add no chart library, browser authentication client or React testing framework. Keep authentication, session validation and protected-page authorization on the server.

## Phase 1: Responsive presentation

### Overview

Replace the starter card with the requested premium layout.

### Changes Required

#### 1. Login composition and visual assets

**Files:** `src/pages/auth/signin.astro`, new `src/components/auth/BrandPanel.astro` and `src/components/auth/InvestmentDashboardPreview.astro`; scoped login styles; local Inter assets and license.

**Intent:** Deliver the agreed navy/emerald design without restyling dashboards.

**Contract:**

- Desktop, from 1024px: two columns, branding left and centered form right.
- Tablet, 768–1023px: retain two columns with simplified preview content.
- Mobile, below 768px: compact branding above the form; hide the dashboard preview.
- Use the supplied headline “Every investment tells a story.”, supporting description, “Welcome back” heading and account description.
- Preview contains balance, percentage, SVG performance chart, sample activity and insight cards. Label it “Illustrative portfolio”; use fixed fictional data and no private-data requests.
- Add scoped navy/emerald semantic token overrides. Do not change global primary colors or global native-control color scheme.
- Bundle Inter WOFF2 assets and their license locally; use `font-display: swap` with a system fallback.
- Use subtle CSS transitions and respect reduced motion. Decorative graphics must not create screen-reader noise.

### Success Criteria

#### Automated Verification

- Static verification passes: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`.

#### Manual Verification

- Desktop, tablet and mobile layouts show the required content without clipping or horizontal scrolling.

## Phase 2: Form behavior and server security

### Overview

Make authentication clear, accessible and safe while preserving native navigation.

### Changes Required

#### 1. Accessible native form

**Files:** `src/components/auth/SignInForm.tsx`, `FormField.tsx`, `PasswordToggle.tsx`, `SubmitButton.tsx`, `ServerError.tsx` in the same directory.

**Intent:** Improve validation, focus and submission feedback without replacing the established native POST flow.

**Contract:**

- Retain `method="POST"` and `action="/api/auth/signin"` with named email and password fields.
- Extend field helpers with required/autocomplete attributes, linked error descriptions and focus support. Email uses `autocomplete="username"`; password uses `autocomplete="current-password"`.
- Validate required fields and email format; trim email but never alter password.
- Focus the first invalid input after failed client validation. Focus the server error after an authentication failure; otherwise focus email on initial entry.
- Password toggle remains a non-submit button with visible focus, an accessible state/name and a comfortable touch target.
- Explicitly manage pending state for the native POST. Prevent repeated submissions, announce “Signing in…”, and leave credential inputs enabled so their values are submitted.
- Reset pending state when restored from browser history.
- Keep required-field validation and server authentication working without JavaScript. Hide the nonfunctional password toggle until hydration.
- Display server failures through an accessible alert. Never echo a password or retain it across navigation.
- Preserve existing helper callers when adding optional props; avoid global style changes.

#### 2. Server validation and fixed errors

**Files:** `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`, `src/pages/auth/callback.ts`; shared auth validation/error helpers under `src/lib/`.

**Intent:** Reject malformed submissions and remove provider/account-state details from visible failures.

**Contract:**

- Validate form values as strings, reject missing/invalid fields and malformed bodies before calling Supabase.
- Replace arbitrary error copy with fixed error codes: `invalid_input`, `signin_failed`, `link_failed`.
- Render only locally defined messages. Unknown error values produce a generic failure message.
- Use the same authentication-failure message for invalid credentials and account-state failures: “Unable to sign in. Check your email and password and try again.”
- Update callback failures to use `link_failed`, preserving the existing successful callback destination.
- Continue reporting unexpected failures through existing observability; never add credential or token logging.

#### 3. Safe return destinations

**Files:** `src/middleware.ts`, signin route/form/API and one shared server-side return-destination validator under `src/lib/`.

**Intent:** Restore the requested dashboard view after login without introducing an open redirect.

**Contract:**

- Use `returnTo` for the signin query parameter and hidden form field.
- Permit only same-origin dashboard paths: `/dashboard` or descendants. Preserve their query strings; discard fragments.
- Reject absolute URLs, protocol-relative URLs, backslashes, control characters and paths that normalize outside the dashboard. Fall back to `/dashboard`.
- Anonymous protected GET requests preserve pathname and query through signin. Protected mutation requests retain their existing login redirect behavior.
- Revalidate the hidden value on POST; preserve only validated destinations after failure.
- Already authenticated visitors to signin use the same validated destination.

#### 4. Session cookies and request origin

**Files:** `src/lib/supabase.ts`; existing Astro security configuration and local auth tests.

**Intent:** Harden server-managed sessions while preserving refresh, callback and signout behavior.

**Contract:**

- Configure Supabase SSR cookies explicitly with HttpOnly, SameSite=Lax, path `/`, and Secure in production.
- Preserve existing cookie names, lifetime, chunking, refresh and deletion behavior. Keep local HTTP development supported.
- Preserve Astro origin checking and prove cross-origin form POST rejection. Do not introduce a parallel CSRF-token system.
- Retain server `getUser()` authorization and existing ownership protections.

### Success Criteria

#### Automated Verification

- Unit tests pass for server validation, fixed errors, return-destination validation and cookie options.
- Static verification passes in the prescribed order.

#### Manual Verification

- Keyboard submission, invalid-field focus, error announcements, password visibility and pending feedback work without disrupting native POST navigation.

## Phase 3: Regression and visual verification

### Overview

Prove the redesigned login against real local authentication and review its rendered states.

### Changes Required

#### 1. Regression coverage and rendered acceptance

**Files:** Auth tests beside shared helpers, `src/lib/observability/auth.test.ts`, `tests/e2e/` auth/session tests and `scripts/testing/smoke.mjs`.

**Intent:** Cover changed authentication contracts and the visible states that static checks cannot prove.

**Contract:**

- Add pure validation/redirect tests to existing Vitest coverage.
- Update observability assertions for fixed error codes while retaining unexpected-error reporting checks.
- Add anonymous Playwright coverage using empty storage state.
- Update existing heading and anonymous-redirect expectations for “Welcome back” and validated `returnTo`.
- Extend local HTTP smoke assertions for changed redirects, generic failures and origin rejection.
- Use existing local credentials/accounts; never point tests at production.
- Capture intentional screenshots at 1440×900, 834×1112 and 390×844, including default, validation-error, server-error and pending states.

### Success Criteria

#### Automated Verification

- `npm test` passes.
- Static verification passes: sync → lint → Astro check → build.
- Local HTTP smoke and targeted Playwright auth/session tests pass.

#### Manual Verification

- Screenshots confirm the agreed design, readable contrast, visible focus, reduced-motion behavior and comfortable mobile controls.
- Screen-reader review confirms labels, validation descriptions and failure announcements.

## Testing Strategy

### Unit Tests

- Empty fields, malformed email, malformed form data and unchanged password whitespace.
- Wrong credentials and account-state errors show identical generic feedback; unknown query error text never appears verbatim.
- Valid nested dashboard destinations survive failed and successful login.
- External, protocol-relative, encoded escape and sibling-path destinations fall back safely.
- Explicit cookie attributes retain refresh/deletion behavior.

### Integration Tests

- One native POST during pending state; Enter submission and history restoration.
- Successful login without JavaScript.
- HttpOnly cookies, production Secure configuration, session persistence, refresh, signout and callback behavior.
- Cross-origin POST rejection, anonymous dashboard protection and continued signup refusal.

### Manual Testing Steps

1. Review screenshots at all three specified viewport sizes and all named form states.
2. Navigate and submit with keyboard; review error focus and screen-reader announcements.
3. Check reduced motion, contrast, font loading, touch targets and absence of horizontal scrolling.

Use the repository verification skill's ordered checks and local smoke walk. Do not use `astro preview` or Vercel cloud actions. Report skipped or failed checks accurately.

## Performance Considerations

Use static SVG/CSS for the preview, local fonts and the existing React island. Avoid new charting or client-authentication dependencies.

## Migration Notes

No database migration or hosted setting change is required. Existing sessions should remain usable because cookie names and storage format remain unchanged. Cookie changes require callback, refresh and signout regression checks.

## References

- `context/changes/new/change.md` — complete supplied brief
- `context/foundation/prd.md` — FR-001, FR-002 and Access Control
- `context/foundation/lessons.md` — repository constraints
- `.claude/skills/verify/SKILL.md` — verification sequence

## Progress

### Phase 1: Responsive presentation

#### Automated

- [x] 1.1 Static verification passes: `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`. — 74cbaf2

#### Manual

- [x] 1.2 Desktop, tablet and mobile layouts show the required content without clipping or horizontal scrolling.

### Phase 2: Form behavior and server security

#### Automated

- [x] 2.1 Unit tests pass for server validation, fixed errors, return-destination validation and cookie options. — 76737f9
- [x] 2.2 Static verification passes in the prescribed order. — 76737f9

#### Manual

- [x] 2.3 Keyboard submission, invalid-field focus, error announcements, password visibility and pending feedback work without disrupting native POST navigation.

### Phase 3: Regression and visual verification

#### Automated

- [x] 3.1 `npm test` passes.
- [x] 3.2 Static verification passes: sync → lint → Astro check → build.
- [x] 3.3 Local HTTP smoke and targeted Playwright auth/session tests pass.

#### Manual

- [ ] 3.4 Screenshots confirm the agreed design, readable contrast, visible focus, reduced-motion behavior and comfortable mobile controls.
- [ ] 3.5 Screen-reader review confirms labels, validation descriptions and failure announcements.
