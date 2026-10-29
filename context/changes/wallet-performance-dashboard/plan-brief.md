# Wallet performance dashboard — Plan Brief

## What & Why
Daily observations show recorded wallet growth or loss; reusable local demo data makes testing immediate.

## Starting Point
Latest quotes overwrite older data; genuine earlier values cannot be reconstructed.

## Desired End State
Accessible daily chart plus current realised/open breakdown, existing summary and members.

## Key Decisions Made

| Decision | Choice |
|---|---|
| Capture | Daily midnight UTC |
| History | Preserve observations; gaps stay gaps |
| Controls | 30/90/365 days and All; default90 |
| Demo | About100 investments, five wallets, one year synthetic history |
| Reruns | Preserve edits; explicit fixture reset |

## Scope
Daily history, dashboard and local demo. Excludes live data, cash accounting, reconstructed history and production activation.

## Architecture / Approach
Restricted Supabase capture and pg_cron; exact decimal text; owner-only reads; SVG React island with SSR chart/table.

## Phases at a Glance
1. Storage/capture
2. Dashboard
3. Demo script
4. Acceptance/scheduler verification

Prerequisites: local Supabase/Docker; production scheduling separately authorised.
Estimated effort:3–5 sessions.

## Open Risks & Assumptions
Observations use manual quotes and can be stale; live total may differ from last snapshot.

## Success Criteria
Exact immutable daily history, accessible chart, safe reusable realistic demo.

## References
Full plan: plan.md; Supabase Cron: https://supabase.com/docs/guides/cron
