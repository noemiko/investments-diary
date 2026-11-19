---
change_id: observability-audit-high-findings
title: Address high-severity observability findings in Investments Diary
status: implemented
created: 2026-11-19
updated: 2026-11-19
archived_at: null
---

## Notes

Create a task for the observability audit from 2026-11-19 11:58 that includes the high-severity findings.

Source: [Investments Diary observability audit](../../audits/observability/2026-11-19_market-prices-wallet-snapshots-new-investments.md).

- **MP1 — Preserve market provider diagnostics.** Carry an allowlisted provider, operation stage, failure reason, and safe HTTP status into search and download telemetry. Summarize failed quote batches and keep expected absence and cancellation quiet. Keep search terms and provider payloads private.
- **NI1 — Report unexpected database rejections during investment save.** Distinguish expected outcomes such as receipt expiry from unmapped constraint or trigger failures after form validation. Report unexpected rejections with a safe invariant category and SQLSTATE while keeping raw database messages and diary data private.
