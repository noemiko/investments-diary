---
project: investments-diary
researched_at: 2026-09-23
recommended_platform: Vercel
runner_up: Cloudflare Workers
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3.2 (+ React 19, Tailwind 4)
  runtime: Node.js on Vercel Functions (fluid compute)
  database: Supabase (external — Postgres + Auth via @supabase/ssr 0.12.7)
---

## Recommendation

**Deploy on Vercel.**

Cloudflare Workers led the scoring matrix on cost and on already being wired into the
repo, but the anti-bias cross-check surfaced a cluster of runtime-compatibility risks
that all trace to one root cause: `@supabase/ssr` is pre-1.0 and workerd is not Node.
For a solo developer with thirty after-hours hours, no prior experience with any part of
this stack, and a hard deadline of 2026-11-04, an open upstream bug in the auth path is
the wrong risk to carry. Vercel runs the same code on real Node.js, keeps the project
free at this volume under the Hobby tier, and is the only shortlisted platform besides
Cloudflare with a first-class CLI rollback command. The decision was made by the
developer after reviewing the cross-check, not by score alone.

## Platform Comparison

Hard filter applied: none. The interview established no persistent connections, no
WebSockets, and no background workers, so no candidate was disqualified on runtime
grounds. All six can run Astro SSR — Cloudflare via `@astrojs/cloudflare` on workerd,
the rest via `@astrojs/vercel`, `@astrojs/netlify`, or `@astrojs/node`.

Soft weights applied from the interview: **cost-first** (weighted heavily), **no prior
platform familiarity** (no tie-break available, so documentation quality and CLI
ergonomics were weighted up), **single region acceptable** (edge-native advantage
discounted), **external providers fine** (co-located databases scored as neutral, not a
bonus — Supabase is already the data and auth layer).

| Platform | CLI-first | Managed / serverless | Agent-readable docs | Stable deploy API | MCP / integration | Cost at this volume |
|---|---|---|---|---|---|---|
| **Vercel** | Pass | Pass | Pass | Pass | Pass (public beta) | **$0** (Hobby) |
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass (status unlabeled) | **$0** |
| **Render** | Pass | Pass | Pass | Partial | Pass (GA) | $0 w/ cold starts, else $7/mo |
| Netlify | Pass | Pass | Pass | Partial | Pass | Free tier ≈ 20 production deploys |
| Railway | Pass | Pass | Pass | Partial | Partial (public testing) | $5/mo floor |
| Fly.io | Pass | Partial | Pass | Partial | Partial (experimental) | ~$2–5/mo, no free tier |

Per-platform notes on the scores:

- **Vercel** — `vercel deploy --prod`, `vercel rollback`, `vercel logs --follow`,
  `vercel env add` cover the full operational loop. Docs are the strongest of any
  candidate: every page serves markdown with frontmatter, plus `llms.txt`,
  `llms-full.txt`, and `.graph.md` cross-link maps explicitly addressed to AI agents.
  Loses no criterion. The MCP server at `mcp.vercel.com` is OAuth-backed and in public
  beta as of 2026-09-15.
- **Cloudflare Workers** — identical five passes, and $0 with a wider margin (100k
  requests/day free versus this project's 10k–100k/month). `wrangler rollback` is a real
  command. Dropped to runner-up on cross-check findings, not on score.
- **Render** — the best agent-documentation surface in the set (`llms.txt`, a `.md`
  twin for every page, an agent docs-search endpoint, and a per-tool `claude.md`), and a
  GA MCP server with an official Claude Code plugin. Partial on deploy API because
  rollback has no documented CLI command — dashboard or REST only. Cost-penalised: the
  free web service spins down after 15 minutes with a ~60s cold start, which is
  user-visible on a single-user diary; always-on starts at $7/mo.
- **Netlify** — technically sound and `@astrojs/netlify` 8.2.6 shipped Astro 7 support
  day one. Eliminated on the credit model: a production deploy costs 15 credits against
  a 300-credit free cap, so roughly 20 deploys exhaust the tier, after which projects
  *pause* with no top-up path. That is incompatible with six weeks of iterative
  after-hours work under a cost-minimising constraint.
- **Railway** — no Dockerfile needed (Railpack autodetects Node), good docs, but no CLI
  rollback and a structural $5/mo floor because the Free plan's $1 credit cannot cover
  an always-on SSR container. Additional trap: Railpack silently produces a *static*
  build unless `@astrojs/node` is configured, so a deploy "succeeds" with no SSR.
- **Fly.io** — strongest for workloads this project does not have (persistent processes,
  multi-region, WebSockets). Partial on managed because you own a Dockerfile; partial on
  deploy API because rollback is a manual `fly deploy --image <previous>` that does not
  restore `fly.toml` or secrets. No free tier since the trial-only change, and 2025–2026
  reliability incidents plus community-only support make it a poor first platform for
  someone with no prior experience.

### Shortlisted Platforms

#### 1. Vercel (Recommended)

Runs the existing code on real Node.js, which removes the entire class of workerd
compatibility risk that dominates the Cloudflare cross-check. Free at this volume under
Hobby, whose limits (1M function invocations, 4 Active-CPU hours, 100 GB transfer) sit
orders of magnitude above a single-user diary. Full CLI coverage including a genuine
`vercel rollback`. Documentation is purpose-built for agent consumption. The adapter
`@astrojs/vercel` v11.x is maintained by Astro's own core team and declares
`peerDependencies: { astro: "^7.0.0" }`.

#### 2. Cloudflare Workers

The cheapest option by the widest margin and already configured in the repository
(`@astrojs/cloudflare` 14.3.1 installed, `wrangler.jsonc` present). Static assets are
free and unlimited on every plan. `wrangler rollback`, `wrangler tail`, and
`wrangler secret put` are mature. It lost on a pre-1.0 dependency running against a
non-Node runtime with an open upstream bug, plus two breaking adapter majors inside a
single quarter. Remains the correct fallback if Vercel's Hobby commercial-use clause
ever becomes a problem.

#### 3. Render

The safest option operationally: plain Node.js runtime, native Astro build detection
with no Dockerfile, a GA MCP server, and documentation designed for agents. Ranked third
only on cost — $7/mo for always-on, or a ~60s cold start on the free tier that a
single-user app would hit on essentially every visit. Worth revisiting if the project
ever needs long-running work that neither Vercel nor Cloudflare handles well.

## Anti-Bias Cross-Check: Vercel

Run after the developer swapped away from Cloudflare Workers. The Cloudflare findings
that drove that swap are preserved in the risk register below, because Cloudflare remains
the documented fallback.

### Devil's Advocate — Weaknesses

1. **Vercel's own Astro documentation is stale in a build-breaking way.** The framework
   page (last updated 2026-08-26) shows `@astrojs/vercel/serverless` and
   `output: 'hybrid'` — both removed from the adapter since Astro 5. An agent that
   fetches the obvious source writes a config that does not build. This is the same
   failure shape that counted against Cloudflare; the swap relocates it rather than
   escaping it.
2. **The Hobby tier forbids commercial use, and enforcement is a pause, not a bill.**
   Vercel's fair-use policy defines commercial as any deployment for the financial gain
   of anyone involved in production, explicitly including a paid employee or consultant
   who writes the code. A private investment diary qualifies as personal use today. If it
   ever becomes portfolio work tied to paid consulting, the remedy is Pro at
   $20/seat/month — versus $0 on Cloudflare and $5/mo on Cloudflare's paid tier.
3. **Skew Protection is partially broken for Astro.** `assetQueryParams` is not applied
   to hoisted scripts or inter-chunk imports (withastro/astro #15964, #14545), and custom
   deployment IDs for prebuilt deployments are Next.js / Build Output API only. The
   feature that protects users mid-deploy does not fully work for this framework.
4. **`vercel.json` rewrites are officially unsupported for Astro** — Vercel's own docs
   state they produce inconsistent behaviour. Any rewrite must go through Vercel Routing
   Middleware, which is a different file, a different location, and different semantics
   from the Astro middleware already at `src/middleware.ts`. The two are easy to conflate.
5. **Hobby retains one hour of runtime logs.** For a developer who codes in the evening
   and debugs the next evening, an intermittent auth failure is unreproducible by the
   time anyone looks. Pro raises this to one day.
6. **The swap has a real, if small, cost.** Remove `@astrojs/cloudflare` and `wrangler`,
   delete `wrangler.jsonc`, add `@astrojs/vercel`, re-provision secrets, and correct
   `tech-stack.md` — which already records `deployment_target: cloudflare-pages` and is
   now wrong in a second way.

### Pre-Mortem — How This Could Fail

Six months on, the diary is abandoned two features short of useful. The first evening
lost went to Vercel's own Astro guide: the config it prescribed used a subpath import
removed two majors ago, and the build failed in a way that read as an Astro problem
rather than a documentation problem. Week three, a session bug appeared in production and
the Hobby tier's one-hour log retention meant every investigation started from nothing —
the failure only ever happened while the author was asleep. Week five, the project got
mentioned in a paid engagement, and the question of whether Hobby's commercial clause
applied became a real one; the safe answer was Pro at $20 a month, which the budget had
never contemplated. None of these were platform defects. Each was a small tax on
attention, and the budget was thirty evening hours against a fixed 2026-11-04 deadline.
The confrontation logic — the one thing that made the product worth building — was the
work that kept getting deferred, because infrastructure friction is always more urgent
than product depth and never more important.

### Unknown Unknowns

- **The migration guide will try to downgrade your configuration.** Vercel's
  Cloudflare-migration documentation instructs replacing `locals.runtime.env` with
  `process.env`. This codebase uses neither — `src/lib/supabase.ts` reads config through
  `astro:env/server`, which is typed and framework-level. An agent following that guide
  may "helpfully" rewrite those imports to `process.env`, trading a validated schema for
  untyped globals. Do not let it.
- **Fluid compute changed what you are billed for.** Vercel now bills Active CPU (only
  while code executes, paused during I/O) plus provisioned memory, not wall-clock or
  request count. `src/middleware.ts` awaits `supabase.auth.getUser()` on every request;
  that network wait is genuinely not billed, which is favourable — but it also means
  cost intuitions built from request-count tutorials do not transfer.
- **`vercel install supabase` provisions a *new* Supabase project.** The Marketplace
  integration creates and links a fresh database and injects its credentials as
  environment variables. Running it to "connect Supabase" would silently give this
  project a second, empty database. Wire the existing project by setting env vars by hand.
- **Vercel has no first-party Postgres any more.** Relational storage is Marketplace-only
  (Neon, Supabase, Upstash). This is fine here — Supabase is already external — but it
  invalidates any tutorial or answer predating the change.
- **Astro 7's `cacheVercel()` CDN provider is experimental.** The default caching story
  for an `output: "server"` Astro app on Vercel is not the ISR-everything story the
  marketing implies; caching is opt-in per route and the Astro-specific provider is not
  yet stable.
- **Preview deployments require a git remote, and this project has no git repository.**
  `tech-stack.md` records `ci_provider: github-actions` and
  `ci_default_flow: auto-deploy-on-merge`; none of that exists yet. Vercel's preview URLs,
  branch deploys, and auto-deploy all hang off a connected repository.

## Operational Story

- **Preview deploys**: every push to a non-production branch produces a preview URL
  automatically once the GitHub repository is connected; `vercel deploy` without `--prod`
  does the same from the CLI. Requires a git remote, which does not exist yet — creating
  it is step 1 under Getting Started. Preview URLs are public by default on Hobby;
  Deployment Protection (Vercel Authentication) is the gate if the diary's previews
  should not be world-readable, and given this is a personal financial journal, it should
  be enabled before the first preview carries real data.
- **Secrets**: `vercel env add SUPABASE_URL production` and
  `vercel env add SUPABASE_KEY production`, stored in Vercel project settings and scoped
  per environment (production / preview / development). Never committed. Local
  development pulls them with `vercel env pull .env.local`. Rotation is
  `vercel env rm <NAME> <env>` followed by `vercel env add`, then a redeploy — the values
  are injected at build and runtime, so a rotation without a redeploy leaves the old
  value live.
- **Rollback**: `vercel rollback [deployment-id]`, or `vercel promote` to move an
  existing deployment to production. Time-to-revert is seconds — it is a pointer flip
  onto an already-built deployment, not a rebuild. **Data caveat**: Supabase schema
  migrations do not roll back with the code. Reverting the application onto a
  forward-migrated database can break in ways the rollback cannot fix, so any deploy
  containing a migration needs a tested down-path before it ships.
- **Approval**: promotion to production must be approved by human, any changes of env keys are  provided by human
- **Logs**: `vercel logs <deployment-url> --follow` for runtime logs (retained **1 hour**
  on Hobby — treat as a live tail, not an archive), and `vercel inspect --logs <url>` for
  build logs. Both are read-only and safe for an agent to run unattended. The Vercel MCP
  server (`https://mcp.vercel.com`, public beta) exposes log analysis as structured tools
  if CLI output parsing becomes repetitive; add it with
  `claude mcp add --transport http vercel https://mcp.vercel.com`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Agent follows Vercel's stale Astro docs (`/serverless` subpath, `output: 'hybrid'`) and writes a config that will not build | Devil's advocate | H | M | Treat `docs.astro.build` as authoritative for adapter config, never `vercel.com/docs/frameworks/frontend/astro`. Record this in `AGENTS.md`. |
| Hobby commercial-use clause triggers if the project becomes paid or portfolio-commercial work; enforcement is deployment pause | Devil's advocate | L | H | Keep the diary personal and non-monetised. If that changes, budget $20/mo Pro or fall back to Cloudflare Workers — the code is adapter-portable. |
| One-hour Hobby log retention makes intermittent overnight failures unreproducible | Devil's advocate / Pre-mortem | M | M | Log auth failures to a Supabase table rather than relying on platform logs; check it the next evening. |
| Missing `SUPABASE_URL` / `SUPABASE_KEY` deploys a site that renders correctly but silently fails every login | Research finding (verified in this repo) | M | H | `astro.config.mjs` marks both `optional: true`; `src/lib/supabase.ts` returns `null` and `src/middleware.ts` reads that as logged-out. Flip to `optional: false` so a missing secret fails the build. |
| Agent rewrites `astro:env/server` imports to `process.env` while following Vercel's migration guide | Unknown unknowns | M | M | The migration guide's `locals.runtime.env` → `process.env` step does not apply here. Pin the rule in `AGENTS.md`. |
| `vercel install supabase` provisions a second, empty Supabase project | Unknown unknowns | L | H | Wire the existing project by setting env vars manually. Do not run the Marketplace installer. |
| Supabase migration rolls forward but `vercel rollback` only reverts code | Research finding | M | H | Write a down-migration for every schema change before deploying it; never ship a migration and a feature in the same deploy. |
| Skew Protection does not fully cover Astro's hoisted scripts and inter-chunk imports | Devil's advocate | L | L | Low exposure at one user. Avoid deploying while actively using the app. |
| No git repository exists, so previews, CI, and auto-deploy are all unavailable | Unknown unknowns (verified in this repo) | H | M | `git init` and push to GitHub before the first deploy — it is step 1 below. |
| `@supabase/ssr` 0.12.7 is pre-1.0 and may ship breaking changes inside the six-week window | Research finding | M | M | Pin the exact version in `package.json` rather than carrying the `^` range through to the deadline. |
| *(Fallback risk)* Returning to Cloudflare later reintroduces the open `nodejs_compat` stream bug in the Supabase auth path | Devil's advocate (Cloudflare pass) | — | H | Retained deliberately. If the fallback is ever exercised, verify supabase#37592 is closed first. |
| *(Fallback risk)* `tech-stack.md` records `deployment_target: cloudflare-pages`, but adapter v13 dropped Pages entirely | Research finding (verified in this repo) | H | M | Correct `tech-stack.md` to `vercel`. The stale value would send a future reader to the wrong command family on either platform. |

## Getting Started

Version-checked against this repository on 2026-09-23: Astro 7.3.2,
`@astrojs/cloudflare` 14.3.1, wrangler 4.131.1, `@supabase/ssr` 0.12.7.

1. **Create the git repository.** Nothing else works without it — previews, CI, and
   auto-deploy all hang off a connected remote.
   `git init && git add -A && git commit -m "Initial commit"`, then create a GitHub repo
   and push.
2. **Remove the Cloudflare adapter.**
   `npm rm @astrojs/cloudflare wrangler && rm wrangler.jsonc`
3. **Add the Vercel adapter.** `npx astro add vercel`. This installs `@astrojs/vercel`
   v11.x and writes `adapter: vercel()` into `astro.config.mjs`. The import is the
   **single default export** — `import vercel from '@astrojs/vercel'`. Do **not** use
   `@astrojs/vercel/serverless`; that subpath was removed in Astro 5 and Vercel's own
   documentation still shows it.
4. **Harden the env schema before first deploy.** In `astro.config.mjs`, change both
   `SUPABASE_URL` and `SUPABASE_KEY` to `optional: false`. As written, a missing secret
   produces a silently logged-out site rather than a failed build.
5. **Link and set secrets.**
   `npx vercel link`, then `npx vercel env add SUPABASE_URL production` and
   `npx vercel env add SUPABASE_KEY production`. Repeat for the `preview` environment if
   previews should reach the database. Pull them locally with
   `npx vercel env pull .env.local`.
6. **Deploy.** `npx vercel --prod` for the first manual deploy, or connect the GitHub
   repository in the Vercel dashboard for auto-deploy on merge (which matches the
   `ci_default_flow: auto-deploy-on-merge` already recorded in `tech-stack.md`).
7. **Enable Deployment Protection on previews** before any preview carries real diary
   entries. This is a personal financial journal; public preview URLs are the default.
8. **Local development is unchanged.** `npm run dev` (`astro dev`) runs on Node — there
   is no Vercel-specific dev command to learn. This is a simplification versus Cloudflare,
   where `astro dev` runs on workerd and `wrangler dev` is legacy for adapter v13+.
9. **Update `context/foundation/tech-stack.md`** — `deployment_target` currently reads
   `cloudflare-pages` and is now wrong twice over.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow files)
- Production-scale architecture (multi-region, HA, DR)
