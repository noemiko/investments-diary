# Sources: documents

- documents: 2 requirements (prd.md, shape-notes.md), 19 narrative change folders (16 archived + 2 open + roadmap.md; plan-briefs/change.md read as sample), 3 reference (README.md, CLAUDE.md, scripts/README.md), 6 engineering (test-plan.md, test-stack.md, lessons.md, health-check.md, infrastructure.md, tech-stack.md, deployment/deploy-plan.md)

## Domain documents
| path | kind | what it is about |
|---|---|---|
| context/foundation/prd.md | requirements | product requirements, FR-001..FR-016, business logic, access control, non-goals, open questions (updated 2026-11-02) |
| context/foundation/shape-notes.md | requirements | discovery notes the PRD was written from (2026-09) |
| context/foundation/roadmap.md | narrative | milestones and slices |
| context/archive/*/change.md, plan-brief.md, plan.md | narrative | 16 closed changes, dated 2026-09-20..2026-11-02 |
| context/changes/close-public-signup/*, context/changes/ui-ux-redesign/* | narrative | 2 open changes |
| context/deployment/automatic-stock-prices-manual-selection.sql | reference | operator data-fix SQL |
| README.md, CLAUDE.md | reference | product summary, architecture |
| context/foundation/test-plan.md, lessons.md, health-check.md | engineering | risks, lessons, quality gates — rules only |

## Product goals
- "Every position the author currently holds is recorded in the diary together with the reason it was bought, entered in the first sitting from broker summaries and memory." (context/foundation/prd.md:52-53)
- "Before confirming a new investment, the author sees their existing positions bought for the same kind of reason, together with how those positions are performing, and can act on that information at the moment of the decision." (prd.md:54-56)
- Secondary: "Confirmed US and Polish stock/ETF listings supply automatic prices for open-position results, wallet totals and future daily observations." (prd.md:60-61)
- Guardrails: "Privacy of financial reasoning: theses and positions are never visible to another account" (prd.md:68); "No silent data loss: an entry, once written, is never lost or overwritten without the author knowing." (prd.md:70); "The application never writes or suggests the reason text." (prd.md:71)
- Vision: "Portfolio trackers record numbers, not theses. They have no field for 'why', so they can never close the loop between a reason and its outcome." (prd.md:31-32)
- Non-goals: no declared strategy, no real-time feed/FX/unattended downloads, no broker records, no sharing (prd.md:264-281)

## Change goals
Per-change goals live in context/archive/*/change.md; not used to judge the Core.

## Limitations
- Only US-01 has acceptance criteria (prd.md:79-92, Open Question 4).
- PRD status is "draft" (prd.md:4).
