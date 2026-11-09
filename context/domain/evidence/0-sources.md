# Sources: code

- repo_root: /Users/noemi.kowalewska/Documents/projects/xdev10/investments-diary
- code_scope: . (single application)
- head: b111cc7 (clean)

## Stack
- TypeScript, Astro 7 SSR (output: server) + React 19 islands, Tailwind 4, shadcn/ui
- Supabase (Postgres + Auth + pg_cron), SQL migrations with RLS
- Vercel serverless (Node 24); Vitest, Playwright, Stryker

## Layers
| layer | path patterns | notes |
|---|---|---|
| entry points | src/middleware.ts, src/pages/**/*.ts, src/pages/**/*.astro (form POST handlers in frontmatter), src/pages/api/auth/* | Astro pages handle form POSTs server-side; scheduled DB job registered in supabase/migrations/*register*job*.sql; scripts/automation/configure-wallet-cron.mjs, scripts/accounts/* |
| application logic | src/lib/services/*.ts, src/lib/*.ts, src/lib/market-data/*.ts | no separate use-case layer |
| domain types | src/types.ts, src/db/database.types.ts, src/db/api.types.ts | no separate domain layer — types + services only |
| validation | src/lib/validation/*.ts | input parsing/validation |
| persistence | supabase/migrations/*.sql (tables, checks, triggers, RPC functions, RLS, grants), supabase/config.toml, supabase/rollbacks | many rules live in SQL functions/triggers |
| UI | src/components/**, src/pages/**/*.astro, src/layouts | English copy inline in components |
| tests | src/**/*.test.ts, tests/database/*.test.ts, tests/e2e/*.spec.ts, scripts/testing/** | |

## Excluded
| path | reason |
|---|---|
| context/** | documents, not code (read by docs agent only) |
| src/lib/observability/**, sentry.*.config.ts | error-reporting tooling (read only if it guards a business rule, e.g. privacy scrubbing) |
| scripts/tools, scripts/deployment, scripts/automation/agent-hooks.mjs, roadmap-to-linear.mjs | developer tooling |
| .claude, .codex, .agents, .playwright-cli, playwright-report, test-results, reports, dist, .astro, .vercel, node_modules | agent config, generated output, vendored deps |
| CLAUDE.md / AGENTS.md, README.md | reference documents (docs agent) |
| src/pages/dev/kitchen-sink.astro, src/components/ui/** | dev showcase / generic UI primitives |
