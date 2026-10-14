# Token values — ui-tokens-onboarding

Values changed or added in `src/styles/global.css` (blocks `:root` and `.dark`). Everything else
in the shadcn neutral palette is unchanged, and so is `@theme inline`.

**Keep the blocks in sync.** `.dark` is hard-coded on `<html>`, so `:root` is only a fallback, but
the brand, `--cosmic-*` and `--heading-gradient-*` values are duplicated in both blocks: change
them together. `--sidebar-primary`/`--sidebar-ring` still hold neutral values; sync them to the
brand values when a shadcn Sidebar is added.

Source of the purple/blue values: `node_modules/tailwindcss/theme.css` (Tailwind 4.3.3 installed;
`package.json` declares `^4.2.4`). Lines: `--color-blue-200` :132, `--color-purple-200` :168,
`--color-purple-400` :170, `--color-purple-500` :171, `--color-purple-600` :172.

## Brand role tokens (plan Phase 1, item 2)

| Variable               | `:root` (new)                             | `.dark` (new)                             | `:root` (previous neutral) | `.dark` (previous neutral) |
| ---------------------- | ----------------------------------------- | ----------------------------------------- | -------------------------- | -------------------------- |
| `--primary`            | `oklch(0.558 0.288 302.321)` (purple-600) | `oklch(0.558 0.288 302.321)` (purple-600) | `oklch(0.205 0 0)`         | `oklch(0.922 0 0)`         |
| `--primary-foreground` | `oklch(0.985 0 0)`                        | `oklch(0.985 0 0)`                        | `oklch(0.985 0 0)`         | `oklch(0.205 0 0)`         |
| `--ring`               | `oklch(0.627 0.265 303.9)` (purple-500)   | `oklch(0.714 0.203 305.504)` (purple-400) | `oklch(0.708 0 0)`         | `oklch(0.556 0 0)`         |

Rationale: today's CTA is `bg-purple-600 text-white` (`dashboard.astro:36,59`,
`SubmitButton.tsx:18`), and focus is `ring-purple-400` (`FormField.tsx:63`,
`PositionForm.tsx:167,215`). With these values, `bg-primary text-primary-foreground` (Button
`default`) and `ring-ring` reproduce the purple brand in both themes instead of the achromatic
neutral defaults. The app runs in `.dark` (`Layout.astro`), so the `.dark` column is the one users
see.

## Cosmic background (decision Q4)

`bg-cosmic` keeps its utility name and its rendering. Only the three stop colours moved into
variables, so the 6 views that use it (`Welcome.astro:5`, `dashboard.astro:21`,
`dashboard/new.astro:68`, `auth/signin.astro:9`, `auth/signup.astro:9`,
`auth/confirm-email.astro:22`) render identically.

| Variable        | `:root`   | `.dark`   | Previous                                                              |
| --------------- | --------- | --------- | --------------------------------------------------------------------- |
| `--cosmic-from` | `#0a0e1a` | `#0a0e1a` | literal in `@utility bg-cosmic` (`global.css:114` before this change) |
| `--cosmic-via`  | `#0f1529` | `#0f1529` | same                                                                  |
| `--cosmic-to`   | `#0a0e1a` | `#0a0e1a` | same                                                                  |

`@utility bg-cosmic` → `linear-gradient(to bottom, var(--cosmic-from), var(--cosmic-via), var(--cosmic-to))`.

Rationale: a gradient cannot live in `--background` (that token is a colour consumed as
`bg-background`, `bg-background/90` and so on), so the background gets its own variables. Both
themes carry the same values today because the app is dark-only. A light-theme value is a future
decision, not part of this change. Phase 2 keeps `bg-cosmic` on the dashboard.

## Heading gradient (decision Q5)

| Variable                  | `:root`                      | `.dark`                      | Tailwind source              |
| ------------------------- | ---------------------------- | ---------------------------- | ---------------------------- |
| `--heading-gradient-from` | `oklch(88.2% 0.059 254.128)` | `oklch(88.2% 0.059 254.128)` | blue-200 (`theme.css:132`)   |
| `--heading-gradient-to`   | `oklch(90.2% 0.063 306.703)` | `oklch(90.2% 0.063 306.703)` | purple-200 (`theme.css:168`) |

New utility `text-gradient-heading`:
`background-image: linear-gradient(to right in oklab, var(--heading-gradient-from), var(--heading-gradient-to)); background-clip: text; color: transparent;`

Rationale: this reproduces `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text
text-transparent` (5 files in `src/`). The interpolation uses `in oklab` because Tailwind 4
compiles `bg-gradient-to-r` to `--tw-gradient-position: to right in oklab`
(`node_modules/tailwindcss/dist/lib.js`). Plain `to right` would interpolate in sRGB and shift the
midpoint. Phase 1 does not apply the utility to any view.

## Dependencies

There is no net change to `package.json` or `package-lock.json`. The run of
`npx shadcn@latest add table badge card` added `radix-ui@^1.7.0` and an unrelated npm package
`cn@^0.4.0`, because the generated files imported `cn` from `"cn"` instead of the `utils` alias.
Both were removed with `npm uninstall`, and the lockfile was restored from git (the uninstall had
also bumped `@radix-ui/react-slot` 1.3.3 → 1.4.0). The new files import `cn` from `@/lib/utils`.
`badge.tsx` imports `Slot` from the existing `@radix-ui/react-slot` (`Slot.Root` → `Slot`). The
CLI did not touch `button.tsx` or `global.css`.
