---
change_id: result-correctness
title: Bootstrap unit tests and prove displayed result correctness
status: archived
created: 2026-10-19
updated: 2026-10-26
archived_at: 2026-10-26T18:21:13Z
---

## Notes

Source: [Test Plan](../../foundation/test-plan.md), §3 Phase 1 — Result correctness; risk #1.

Bootstrap the unit runner in CI and prove every displayed result matches independent hand-computed values, including its price date.

Cover gain and loss signs, two-decimal rounding edges, comma versus dot decimal input, eight-decimal precision, unpriced positions, and a displayed price date matching the price used. Ground the scope in every result surface: list, detail, and confrontation. Expected values must be independent of the production formula.

Research the existing computation, formatting, input parsing, test setup, and CI before planning. Follow the strategy and quality gates in the source test plan.
