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

## Deferred

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

## Dead code (decision Q7)

- `src/components/ui/LibBadge.astro`: **deleted** in Phase 1 (grep over `src/`: zero imports).
- `src/components/Topbar.astro`: **kept — deferred: live code, belongs to the landing-page
  migration.** Research reported zero imports, but `Welcome.astro:2,18` imports and renders it on
  `/` (Sign in / Sign up, or email + Dashboard / Sign out). Deleting it would change the landing
  view, which is out of scope (one view per change). Decided at `/10x-implement` Phase 1.

## Dependencies

There is no net `package.json` or lockfile change. For what the shadcn CLI added and how it was
reverted, see `tokens.md` → Dependencies.
