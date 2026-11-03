# Screens — ui-ux-redesign (Phase 4 visual gate)

Captured with Playwright (Chromium) against `npm run dev` and local Supabase, signed in as a
disposable local account seeded with the demo fixtures (`seedDemo` from `scripts/demo/lib/demo-data.mjs`,
five wallets, ~100 investments); the account was deleted afterwards. The stock search was mocked
by route interception on `**/dashboard/new/search` (two Apple listings), so no provider request
was made. The Astro dev toolbar is hidden. Viewports: desktop 1280×900 and phone 390×844.
`/dashboard/new` states are full-page; the others are viewport-sized.

"Before" is the branch after Phase 3 (`4f72ce4`); "after" is Phase 4.

## `/dashboard` and `/dashboard/wallets/[id]`

Phase 4 does not touch these views, so one capture shows the final state of the change.
The dashboard before Phase 1 is in
`context/archive/2026-10-07-ui-tokens-onboarding/screens/dashboard-after.png`.

| View                   | Desktop                                        | 390px                                  |
| ---------------------- | ---------------------------------------------- | -------------------------------------- |
| Dashboard              | [dashboard-desktop.png](dashboard-desktop.png) | [dashboard-390.png](dashboard-390.png) |
| Wallet detail (Rising) | [wallet-desktop.png](wallet-desktop.png)       | [wallet-390.png](wallet-390.png)       |

## `/dashboard/new`

| State                                                    | Before (desktop / 390)                                                                          | After (desktop / 390)                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Empty (first load)                                       | [desktop](before-new-empty-desktop.png) / [390](before-new-empty-390.png)                       | [desktop](after-new-empty-desktop.png) / [390](after-new-empty-390.png)                       |
| Search results (wallet chosen, Enter in the query)       | [desktop](before-new-search-results-desktop.png) / [390](before-new-search-results-390.png)     | [desktop](after-new-search-results-desktop.png) / [390](after-new-search-results-390.png)     |
| Selected (AAPL selected, focus on Change)                | [desktop](before-new-selected-desktop.png) / [390](before-new-selected-390.png)                 | [desktop](after-new-selected-desktop.png) / [390](after-new-selected-390.png)                 |
| Earlier positions (category with history, panel in view) | [desktop](before-new-confrontation-desktop.png) / [390](before-new-confrontation-390.png)       | [desktop](after-new-confrontation-desktop.png) / [390](after-new-confrontation-390.png)       |
| Validation error (Save on an empty form)                 | [desktop](before-new-validation-error-desktop.png) / [390](before-new-validation-error-390.png) | [desktop](after-new-validation-error-desktop.png) / [390](after-new-validation-error-390.png) |

Intended deltas: the narrow translucent glass card becomes the opaque `Card` (`max-w-3xl`) used by
the other form views; the heading uses `text-gradient-heading` and sits next to an outline
"Back to your positions" link, as on Deleted positions; inputs and selects use `border-input`,
`ring-ring` focus and `aria-invalid` destructive borders; secondary text is `text-muted-foreground`;
"Search listings" and "Select …" are outline buttons. Copy and behaviour are unchanged, and results
in the earlier-positions panel carry no gain/loss colour.

## Sign-in (side effect of the shared `FormField`)

[signin-before.png](signin-before.png) / [signin-after.png](signin-after.png), desktop, after
submitting an empty form. Labels and icons move to `text-muted-foreground`, inputs to the token
border and transparent fill, errors to `text-destructive`. The sign-in card and button are unchanged.
