# Investment Diary login page — Plan Brief

> Full plan: `context/changes/new/plan.md`

## What & Why

Replace the starter login card with a polished, responsive fintech login.
Preserve real Supabase authentication while improving accessibility, submission
feedback and server security.

## Starting Point

The app uses Astro SSR, React islands, Tailwind and cookie-backed Supabase
authentication. Login already works through a native form POST. The current page
uses purple accents, exposes provider error messages and always redirects to the dashboard.

## Desired End State

A dark navy page with emerald accents presents branding and an illustrative
portfolio on the left, with an accessible login form on the right. Successful
login restores a safe dashboard destination. Authentication errors remain generic,
and sessions stay server-managed.

## Key Decisions Made

| Decision | Choice | Reason |
| --- | --- | --- |
| Visual direction | Emerald tokens scoped to login | Follow the brief without restyling dashboards |
| Theme | Dark only | Matches existing application behavior |
| Typography | Self-hosted Inter | Consistent typography without external font requests |
| Unsupported controls | Omit recovery, signup, Google and remember-me | Avoid dead links and preserve closed signup |
| Authentication | Retain native POST and Supabase SSR | Preserve the established architecture |
| Security | Include validation, generic errors, safe redirects and cookie hardening | Meet the supplied security requirements |

## Scope

**In scope:** responsive login, illustrative preview, local Inter assets,
accessible validation and feedback, safe dashboard return destinations, fixed
server errors, cookie hardening and regression coverage.

**Out of scope:** password recovery, public registration, OAuth, remember-me,
light-mode support, dashboard restyling, database changes and cloud deployment.

## Architecture / Approach

Use Astro for static branding and dashboard illustration, retaining one React
island for the interactive form. Reuse existing components and semantic tokens.
Add no chart library, browser authentication client or React testing framework.
Keep authentication, session validation and authorization on the server.

## Phases at a Glance

| Phase | Deliverable | Key risk |
| --- | --- | --- |
| 1. Responsive presentation | Layout, branding and typography | Styles leaking into other views |
| 2. Form behavior and server security | Accessible form and hardened server contracts | Native submission or session regression |
| 3. Regression and visual verification | Automated coverage and visual acceptance | Tests assuming an authenticated browser |

**Prerequisites:** Node 24, dependencies installed, local Supabase/Docker and local test accounts.
**Estimated effort:** Two to three implementation sessions.

## Open Risks & Assumptions

- Cookie changes require callback, refresh and signout regression checks.
- Visual quality and contrast require rendered verification.
- No hosted configuration changes are planned.

## Success Criteria (Summary)

- Login looks polished on desktop, tablet and mobile, with no horizontal scrolling.
- Login works with keyboard and without JavaScript, with clear validation and feedback.
- Server authorization and sessions remain secure; safe dashboard destinations survive login.

## References

- `context/changes/new/change.md` — supplied brief
- `context/foundation/prd.md` — FR-001, FR-002 and Access Control
- `context/foundation/lessons.md` — constraints
- `.claude/skills/verify/SKILL.md` — verification sequence
