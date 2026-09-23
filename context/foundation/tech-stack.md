---
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
---

## Why this stack

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
