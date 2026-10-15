# Dashboard na tokenach — Plan Brief

> Full plan: `context/changes/ui-tokens-onboarding/plan.md`
> Research: `context/changes/ui-tokens-onboarding/research.md`

## What & Why

Przepinamy listę pozycji (`/dashboard`) z ręcznej palety purple/blue na tokeny shadcn, które
repo ma od początku, ale których żaden widok nie czyta. Bez tego S-02 (wynik i data ceny) i
S-03 (konfrontacja) dołożą kolejne literały palety i kolejne ręcznie budowane tabele i przyciski.

## Starting Point

`global.css` ma kompletne, poprawnie opublikowane tokeny (35 w `@theme inline`), ale `.dark`
nigdy nie jest aplikowane, a `--primary` jest szare. Dashboard ma 14 klas palety, 12 `white/*`
i tło z surowego hexa (`bg-cosmic`). W `ui/` jest tylko `button.tsx`. Repo nie ma test runnera.

## Desired End State

Dashboard wygląda ciemno i fioletowo jak dziś, ale każdy kolor pochodzi z tokenu ról, a tabela,
badge, karta i przyciski są komponentami z `src/components/ui/`. Pozostałe widoki wyglądają bez
zmian. `/dev/kitchen-sink` pokazuje widok we wszystkich stanach i nie istnieje w produkcji.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Widok | `src/pages/dashboard.astro` | Jedyny widok z danymi; rozbudowują go S-02/S-03/S-04 | Research |
| Motyw | `class="dark"` na `<html>` | Zachowuje wygląd, a inne widoki (wciąż na palecie) nie odstają | Plan |
| Marka | Fiolet w `--primary`/`--primary-foreground`/`--ring` w obu motywach | Charakter zostaje, kolor ma jedno źródło | Plan |
| Tło | `bg-background` na dashboardzie; `bg-cosmic` zostaje dla 5 innych widoków | Widok w 100% na tokenach, zakres = jeden widok | Plan |
| Nagłówek | `text-foreground`, bez gradientu | Czytelny, bez nowego tokenu, nie konkuruje z CTA | Plan |
| Prymitywy | `npx shadcn add table badge card`; `--success` → S-02; martwy kod odroczony | Zakres 10x-ui: jeden widok + globalne tokeny | Plan |
| Reguła `client:*` | Zwolnienie dla `src/components/ui/` dopisane do `CLAUDE.md` | Te same prymitywy posłużą wyspie React w S-03 | Plan |
| Bramka | Dev-only `/dev/kitchen-sink` + screenshoty desktop/390px | Wszystkie stany bez Supabase, bez instalowania Playwrighta | Plan |

## Scope

**In scope:**
- `charges.md` (3–5 zarzutów) i `tokens.md` (wartości + źródło) w folderze zmiany
- 3 zmienne × 2 motywy w `global.css`, `class="dark"` w `Layout.astro`
- `table.tsx`, `badge.tsx`, `card.tsx` w `ui/`; jedno zdanie w `CLAUDE.md`
- `dashboard.astro` + `PositionsTable.astro` + `PositionsEmptyState.astro`
- `/dev/kitchen-sink`, fixture'y, screenshoty

**Out of scope:**
- 6 pozostałych widoków, `bg-cosmic` na nich, komponenty z `components/auth/`, `PositionForm`
- Input/Label/Select/Alert w `ui/`, token `--success`, usunięcie `Topbar`/`LibBadge`
- Przełącznik motywu, jasny motyw, Playwright

## Architecture / Approach

Kontrakt przed pikselami. Faza 1 zmienia wartości tokenów i włącza `.dark`, nie zmieniając
wyglądu żadnego widoku, bo jedyny konsument `--primary` ma kolory nadpisane, a reszta maluje
paletą. Faza 2 składa dashboard z prymitywów renderowanych statycznie z `.astro` (linki przez
`buttonVariants()`, bo `asChild` nie działa ze slotami Astro). Faza 3 renderuje te same
komponenty z fixture'ów na stronie chronionej guardem `import.meta.env.DEV`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Contract | Fioletowe tokeny, `.dark`, Table/Badge/Card, reguła w CLAUDE.md, charges/tokens | `shadcn add` dociąga drugi pakiet `Slot` lub próbuje nadpisać `button.tsx`/`global.css` |
| 2. One view | Dashboard tylko na klasach semantycznych i komponentach `ui/` | Mobile 390px: tabela rozpycha stronę |
| 3. States | Kitchen sink w stanach + screenshoty jako bramka | Guard DEV nie zadziała i strona trafi na produkcję |

**Prerequisites:** lokalny Supabase (`npx supabase start`) dla `npm run dev` i smoke; dostęp do sieci dla `npx shadcn add`; Vercel preview brancha do sprawdzenia 404.
**Estimated effort:** ~2 sesje wieczorne w 3 fazach.

## Open Risks & Assumptions

- Zakładamy, że włączenie `.dark` nie zmienia wyglądu 6 innych widoków. Faza 1 weryfikuje to porównaniem przed/po.
- Kontrast tekstu `text-primary` (purple-600) na ciemnym tle jest słaby. Dashboard nie ma linków tekstowych, ale przyszłe widoki z `variant="link"` będą wymagały sprawdzenia.
- Do S-02 dashboard i formularz `dashboard/new` będą miały różne tła (`bg-background` vs `bg-cosmic`).

## Success Criteria (Summary)

- Dashboard wygląda jak przed zmianą (ciemny, fioletowy CTA), a grep palety po plikach widoku nie zwraca nic.
- Zmiana `--primary` w `global.css` przekolorowuje CTA dashboardu bez dotykania widoku.
- Kitchen sink pokazuje wszystkie stany w 1280px i 390px, a na preview zwraca 404.
