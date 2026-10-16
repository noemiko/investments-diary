---
bootstrapped_at: 2026-09-20T17:52:49Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: investments-diary
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

# Bootstrap verification

## Hand-off

Copied verbatim from `context/foundation/tech-stack.md`.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: investments-diary
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack** (from the hand-off body):

The product is a private single-user web diary with a login, straightforward record
management, and one domain rule that runs at the moment an entry is recorded. It needs a
database, authentication and somewhere to deploy, and nothing beyond that. This starter
supplies all three as one pinned set, which matters more than usual here: the author has
roughly thirty hours of evening time across six weeks and has not used any part of this
stack before. Every hour spent wiring a login to a database by hand is an hour not spent
on the confrontation logic that makes the product worth building. The stack is explicitly
typed from the database through to the interface, follows conventions an agent will
recognize, and is well represented in training data, which serves the author's stated
goal of learning to work with coding agents. Cloudflare Pages is the starter's own
deployment default, making the first deploy the shortest path available. Scaffolding
confidence is first-class rather than verified: the setup command is registered and
expected to work, but has not been exercised end to end, so occasional manual steps are
likely. The edge runtime limits long-running work, which this product does not have.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                                                        |
| ----------- | --------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| npm package | not run                                                   | n/a      | cmd_template starts with `git clone`; there is no npm CLI package to resolve |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12 | fresh    | 7 days before this run; repository is not archived, default branch `master`  |

**Tooling note.** The `gh` CLI was not authenticated in this environment, so the repository
check fell back to an unauthenticated call to the public GitHub API. The signal is the same.

**Registry data discrepancy.** The starter card records `stars: 50000`; the repository
actually reports 97. The `popular_in_training` quality gate holds for the underlying
technologies rather than for this template. Not blocking; worth correcting in the registry.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted
**Upstream .git**: removed before move-up, so the starter's history is not inherited

Everything in `context/` was already present in the working directory and the scaffold
carried no `context/` of its own, so no drop rule fired. The `AGENTS.md` symlink pointing
at `CLAUDE.md` was preserved through the move.

**Install-script warning (investigated, benign).** npm blocked post-install scripts for
`esbuild` (two versions), `fsevents` and `workerd` because they are not covered by
`allowScripts`. These packages ship prebuilt platform binaries as optional dependencies,
so the blocked steps were not needed. Verified after install: the darwin-arm64 esbuild
binary is present and reports version 0.28.2, and the workerd binary is present. No action
required.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/0/0
**Packages installed**: 650

No advisories were reported against the dependency tree at the time of this run.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

Authentication is the only feature flag set. The scaffold was not modified on account of
it; the starter already ships an auth layer. No CI/CD workflow was generated, so the
recorded provider and flow are metadata only, awaiting a later step.

## Post-scaffold functional check

Not required by the bootstrap contract; run because the scaffolding confidence was
first-class rather than verified, so the result deserved evidence rather than assumption.

| Check           | Result                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| Astro toolchain | responds, v7.3.2                                                                |
| Node version    | **mismatch** — starter pins 22.14.0 in `.nvmrc`, machine runs v26.7.0           |
| Lint, first run | 20 errors, all `@typescript-eslint/no-unsafe-*` in the starter's own auth pages |
| Lint, after fix | clean, 0 errors                                                                 |

**The 20 lint errors were not a defect in the scaffold.** Astro generates environment and
content types into `.astro/` and that directory does not exist in a fresh clone, so every
reference to `import.meta.env` resolved to an unusable type and cascaded into unsafe-any
errors across the auth pages. Running `astro sync` generated the types and the lint run
came back clean. Anyone cloning this project fresh will hit the same thing and should run
`astro sync` before trusting a lint result.

**Node version mismatch is unresolved.** The starter pins Node 22.14.0; this machine runs
Node 26.7.0. Install, type generation and lint all worked regardless, so nothing is broken
today, but the pin exists for a reason and the gap is four major versions. Worth matching
the pin before debugging any strange runtime behaviour.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your
project is scaffolded and verified — happy hacking.

Note for this run: the starter already shipped its own `CLAUDE.md`, with `AGENTS.md`
symlinked to it. Those files describe the starter, not this product, so they are a
starting point rather than finished agent context.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. This run created none.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. This run found none.
- Copy `.env.example` and fill in the database credentials before running the dev server.
