---
change_id: refactor-opportunities
title: Evaluate refactoring opportunities in Django’s model save and update flow
status: impl_reviewed
created: 2026-11-05
updated: 2026-11-06
archived_at: null
---

## Notes

The [post-flow analysis](../post-flow-analysis/research.md) documents technical debt and structural risks in Django’s model save and update flow. This change addresses the questions that analysis left open. Which problems are worth fixing? What should the code look like afterward? In what order should we tackle them?

During exploration, investigate each recorded problem in the code and its history. Write the findings in this change’s `research.md` and end the report with a ranked list of refactoring options and their trade-offs.

I’ll read the report before we decide what to pursue. That decision belongs to planning. Refactoring begins only after the plan is accepted.
