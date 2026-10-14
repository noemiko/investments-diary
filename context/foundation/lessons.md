# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Pair `color-scheme: dark` with token-based option colours

**Context:** Dark theme / native form controls — `src/components/positions/PositionForm.tsx:166`
(`[&>option]:text-black`), together with `.dark` on `<html>` in `src/layouts/Layout.astro` and
`src/styles/global.css`.

**Problem:** The app now runs in `.dark`, but no `color-scheme: dark` is set, so native select
popups stay light. `[&>option]:text-black` is readable only because of that. Whoever later adds
`color-scheme: dark` gets black options on a dark popup in Chrome on Windows/Linux and in Firefox,
while macOS native menus hide the bug, so it passes a local check.

**Rule:** When introducing `color-scheme: dark`, replace `[&>option]:text-black` with
`[&>option]:bg-popover [&>option]:text-popover-foreground` in the same change and check a select
in Firefox.

**Applies to:** plan, implement, impl-review
