# Charges — `/dashboard` (`src/pages/dashboard.astro`)

Line numbers for `dashboard.astro` are the current file, which Phase 1 does not touch. Line numbers
for `global.css` and `Layout.astro` are the state before this change (commit `c991b29`).

## Charges

| #   | Category                 | `file:line`                                                                                                                                                                   | User impact                                                                                                                                                                                                                                                                                                                                                        | Phase                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | missing tokens           | `dashboard.astro:25,28,36,59,100`                                                                                                                                             | The purple CTA, the badge pill, the heading gradient and two different `blue-100` opacities for secondary text (`/60` at :28,67; `/80` at :54,93,95,98) sit outside the tokens, so the colours do not follow the theme and secondary text has no consistent level.                                                                                                 | Tokens defined in Phase 1 (`--primary`, `--ring`, `--heading-gradient-*` + `text-gradient-heading`, see `tokens.md`). The view switches to them in Phase 2.                                                                                                                                                                 |
| 2   | missing tokens           | `dashboard.astro:21` + `global.css:114`                                                                                                                                       | The page background is a raw hex gradient that no token controls, so retheming the app means editing a utility's literal values.                                                                                                                                                                                                                                   | Phase 1: `bg-cosmic` now reads `--cosmic-from/via/to` (identical rendering in all 6 views). Phase 2 keeps `bg-cosmic` on the dashboard.                                                                                                                                                                                     |
| 3   | missing shared component | `dashboard.astro:34-47,57-62` (hand-styled buttons instead of `Button`), `:100` (pill instead of Badge), `:65-108` (table without a primitive), `:22,53` (cards without Card) | Each control is restyled by hand, so the same action looks and behaves differently across views, and S-02/S-03 would copy the markup again.                                                                                                                                                                                                                        | Phase 1: `table.tsx`, `badge.tsx` and `card.tsx` added to `src/components/ui/`. Phase 2: the view uses them plus `buttonVariants`.                                                                                                                                                                                          |
| 4   | accidental architecture  | `Layout.astro:12`                                                                                                                                                             | `.dark` is never applied, so the dark token values never reach the user: `body` paints white `--background`, and the views look dark only because of `bg-cosmic` and manual `text-white`. Entries checked: logged out → redirect to `/auth/signin` (`middleware.ts:14-17`); no data → empty state (`dashboard.astro:52-63`); direct link → OK (no per-page state). | Phase 1: `<html lang="en" class="dark">`.                                                                                                                                                                                                                                                                                   |
| 5   | missing tokens (focus)   | `dashboard.astro:34-47,57-62` + `global.css:119`                                                                                                                              | The hand-styled buttons have no `focus-visible` style. A keyboard user gets only the global `outline-ring/50`, which was a grey that barely shows on the cosmic background.                                                                                                                                                                                        | Phase 1: `--ring` is now purple in both themes. Phase 2: `buttonVariants` brings `focus-visible:ring-ring/50 ring-[3px]`. **Intended visible change in Phase 1:** keyboard focus on `SubmitButton` and on links/buttons without `outline-none` in all views turns grey → purple; checked with a Tab pass during manual 1.8. |

## Gate evidence (Phase 3)

Screenshots in `screens/`, captured with headless Chrome against `npm run dev` and local Supabase.
`dashboard-before.png` was rendered from `dashboard.astro` at `51c40e5` (after Phase 1, which
manual check 1.8 confirmed looks the same as before the change).

| Charge | Evidence                                                                                                                                                                                                                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | [dashboard-before.png](screens/dashboard-before.png) vs [dashboard-after.png](screens/dashboard-after.png): CTA purple from `--primary`, heading from `text-gradient-heading`, secondary text at a single `text-muted-foreground` level.                                                                                                     |
| 2      | [dashboard-after.png](screens/dashboard-after.png): the page background is `bg-cosmic`, now token-backed (`--cosmic-*`, decision Q4), so it renders the same as before.                                                                                                                                                                      |
| 3      | [kitchen-sink-desktop.png](screens/kitchen-sink-desktop.png): `Table*`, `Badge`, `Card` and `buttonVariants` in every named state (typical rows, null fields, long texts, empty, error — added after impl-review F2).                                                                                                                        |
| 4      | [dashboard-after.png](screens/dashboard-after.png): Card and table read `.dark` token values (`bg-card`, `border-border`, `text-muted-foreground`).                                                                                                                                                                                          |
| 5      | [kitchen-sink-desktop.png](screens/kitchen-sink-desktop.png) and [kitchen-sink-390.png](screens/kitchen-sink-390.png): the Focus button in both variants shows the purple `ring-ring/50` ring; Disabled is dimmed. At 390px the page has no horizontal overflow (`scrollWidth == clientWidth`); long rows scroll inside the table container. |

**Intended visible deltas** (before → after): the Card is the opaque neutral `bg-card` instead of
translucent `bg-white/10` with `backdrop-blur`; the category pill is the neutral
`Badge variant="secondary"` instead of a purple tint; table cells use shadcn's `p-2` instead of
`px-3 py-2`.

## UI quality checklist (Phase 3)

`.claude/skills/10x-ui/references/ui-quality-checklist.md` reviewed against this change.

- **Charges**: all five met (list with `file:line` and impact; tokens; shared components;
  entries checked logged out, with no data and from a direct link; unaddressed charges deferred below).
- **Contract**: tokens from `global.css`, components from shadcn via `shadcn add`, states default /
  hover / focus / disabled / empty covered (error and loading do not apply: no form, no client
  loading), desktop + 390px, focus visible and every control has a text name — met.
  Dark mode changed at the token layer — met; **checked in both themes — not met, deferred** (see below).
- **Gate**: kitchen sink present; scope held to one view plus global tokens — met.
  **`/10x-impl-review`** — Phase 1 done (`reviews/impl-review-phase-1.md`); the full-plan review
  runs after Phase 3.

## Deferred

- **Light theme check.** Reason: out of scope (plan, "What We're NOT Doing"). `.dark` is hard-coded
  on `<html>`, so `:root` values are unreachable until a theme switch or `prefers-color-scheme`
  lands; verify both themes in that change.

- **Other 6 views** (landing, `auth/signin`, `auth/signup`, `auth/confirm-email`,
  `dashboard/new`): their palette classes and heading gradients stay as they are. Reason: one view
  per change (10x-ui). Their `bg-cosmic` is already tokenized by charge 2, with no visual change.
- **Applying `text-gradient-heading`**: the utility exists, but Phase 1 uses it nowhere. The
  dashboard `h1` switches in Phase 2, and the other 5 files (`signin`, `signup`, `confirm-email`,
  `dashboard/new` and the `via-` variant in `Welcome.astro:22`) are deferred with their views.
- **Form components** (`components/auth/FormField`, `ServerError`, `SubmitButton`,
  `PasswordToggle`, `positions/PositionForm.tsx`) and moving them to `ui/`. Reason: out of scope
  (forms). `SubmitButton.tsx:18` still overrides `Button` colours. Because `--primary` is now
  purple-600, a later change can drop the override without changing the look.
- **Input/Label/Textarea/Select/Alert primitives.** Reason: the dashboard does not need them. They
  arrive with forms or S-02.
- **`--success`/`--positive` token.** Reason: decision Q6. It lands in S-02 with result display.
- **Positions list beyond `max_rows`.** `listPositions` (`src/lib/services/positions.ts:44-49`) has no
  `.range()`, so PostgREST silently cuts the list at `max_rows` (1000 locally, `supabase/config.toml:18`).
  Reason: predates this change and is unrealistic soon for one author; add pagination or a
  "showing first N" notice when the list grows (impl-review F3).

## Dead code (decision Q7)

- `src/components/ui/LibBadge.astro`: **deleted** in Phase 1 (grep over `src/`: zero imports).
- `src/components/Topbar.astro`: **kept — deferred: live code, belongs to the landing-page
  migration.** Research reported zero imports, but `Welcome.astro:2,18` imports and renders it on
  `/` (Sign in / Sign up, or email + Dashboard / Sign out). Deleting it would change the landing
  view, which is out of scope (one view per change). Decided at `/10x-implement` Phase 1.

## Dependencies

There is no net `package.json` or lockfile change. For what the shadcn CLI added and how it was
reverted, see `tokens.md` → Dependencies.
