<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard na tokenach (ui-tokens-onboarding)

- **Plan**: context/changes/ui-tokens-onboarding/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-10-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

Reviewed against the staged (uncommitted) diff vs `c991b29`. User decisions in `change.md`
("Implementation adaptation") override the plan text for Q4/Q5/Q7 and were treated as the plan.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Automated criteria 1.1–1.5 pass (verify sequence exit 0; `ui/` = badge, button, card, table; no
palette classes; `class="dark"` ×1; only `@radix-ui/react-slot`, no `radix-ui`). Manual 1.6–1.9
pending human confirmation. Primitives are byte-identical to shadcn new-york-v4 apart from the
documented `cn`/`Slot` import rewiring. No element outside `ui/` relies on the default border
colour, so `.dark`'s `--border` causes no visible change.

## Findings

### F1 — charges.md overstates blue-100 opacities

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/ui-tokens-onboarding/charges.md:10
- **Detail**: Says "four `blue-100` opacities" at `:25,28,36,59,100`. Pre-change dashboard has two (`/60` at :28,67; `/80` at :54,93,95,98); only :28 of the cited lines carries `blue-100`. Wording inherited from the plan. Phase 2 and the final review use this file as input.
- **Fix**: Reword to "two `blue-100` opacities (/60, /80) at :28,54,67,93,95,98" and keep the purple refs at :25,36,59,100.
- **Decision**: FIXED — charges.md:10 reworded to two opacities (/60, /80) with line refs

### F2 — `color-scheme` trap with `[&>option]:text-black`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/positions/PositionForm.tsx:166 (latent; triggered by src/styles/global.css `.dark`)
- **Detail**: `.dark` is now on, but no `color-scheme: dark` is set, so native popups stay light. That's not a regression. The black-option hack works only because of this. Whoever later adds `color-scheme: dark` gets black-on-dark options on Chrome Win/Linux and Firefox. On macOS native menus hide the bug.
- **Fix A ⭐ Recommended**: Record as a lesson (when introducing `color-scheme: dark`, replace `[&>option]:text-black` with `bg-popover`/`text-popover-foreground` in the same change).
  - Strength: Zero code change now, out of scope here (forms excluded); guards the exact future change that breaks it.
  - Tradeoff: Relies on lessons.md being read (it is, by plan/implement/review).
  - Confidence: HIGH — behaviour of `color-scheme` on native selects is well-known.
  - Blind spot: Didn't test in a Windows/Linux browser.
- **Fix B**: Add to charges.md as deferred under the forms migration.
  - Strength: Keeps it with this change's audit trail.
  - Tradeoff: Archived with the change; less visible to future, unrelated changes.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Pair `color-scheme: dark` with token-based option colours (Fix A; lesson in context/foundation/lessons.md; PositionForm.tsx:166 switched to `[&>option]:bg-popover [&>option]:text-popover-foreground`)

### F3 — Purple focus outline is a visible change

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/styles/global.css:28,66 (`--ring`), :137 (`outline-ring/50`)
- **Detail**: Keyboard focus on SubmitButton and on links/buttons without `outline-none` (Topbar, Welcome, dashboard sign-out) turns from grey to purple. This is intended, but criterion 1.8 says "looks the same".
- **Fix**: Accept as intended; confirm during manual 1.8 with a Tab pass and mention it in charges.md.
- **Decision**: FIXED — intended change noted on charge 5 in charges.md; confirm with a Tab pass in manual 1.8

### F4 — Brand values not mirrored in `--sidebar-*`; `:root`/`.dark` duplication

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/styles/global.css:38,79
- **Detail**: `--sidebar-primary`/`--sidebar-ring` stay neutral (consistent with plan's "only 3 vars"). The brand + cosmic + heading values are duplicated in both blocks, while `:root` is effectively unreachable with `.dark` hard-coded.
- **Fix**: Add a line in tokens.md: "`:root` and `.dark` must stay in sync; sync `--sidebar-*` when a Sidebar is added."
- **Decision**: FIXED — sync note added to tokens.md

### F5 — lint-staged will reformat CLAUDE.md:8 on commit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md:8
- **Detail**: This was already failing before the change: prettier wants `_reason_` for `*reason*`. lint-staged runs `prettier --write` on `*.md`, so the Phase 1 commit will silently include that out-of-diff edit (the implementer reverted it once).
- **Fix**: Accept it. It's a one-character formatting change, and the commit body should mention it.
- **Decision**: DISMISSED — premise false: .husky/pre-commit runs `npm run lint` only; lint-staged is never invoked, so nothing reformats CLAUDE.md on commit
