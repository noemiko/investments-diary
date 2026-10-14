---
date: 2026-10-07T10:07:06+0200
researcher: Noemi Kowalewska (with Claude Code)
git_commit: c991b29
branch: master
repository: investments-diary
topic: "Konfiguracja stylów, tokeny i użycie klas kolorów w src/"
tags: [research, ui, tokens, tailwind-v4, shadcn, dashboard]
status: complete
last_updated: 2026-10-07
last_updated_by: Noemi Kowalewska (with Claude Code)
---

# Research: konfiguracja stylów i użycie klas kolorów

**Date**: 2026-10-07T10:07:06+0200
**Researcher**: Noemi Kowalewska (with Claude Code)
**Git Commit**: c991b29 (drzewo robocze czyste poza tym folderem zmiany)
**Branch**: master
**Repository**: investments-diary

## Research Question

1. Dokładna ścieżka do głównego pliku stylów oraz lista zmiennych w `:root` i `.dark`.
2. Zmienne poprawnie publikowane w `@theme` / `@theme inline`.
3. Komponenty obecne fizycznie w `src/components/ui`.
4. Pliki w `src`, które używają twardo zakodowanych klas kolorów zamiast semantycznych.
5. Brakujące prymitywy UI potrzebne do wyświetlenia danych w docelowym widoku.

Bez zmian w kodzie — jedynym zapisem jest ten plik i status w `change.md`.

**Założenie co do „docelowego widoku”**: `change.md` nie nazywa widoku. Przyjęto
`src/pages/dashboard.astro` (lista pozycji, FR-010) — to jedyny widok, który dziś wyświetla
dane, i ten sam, który rozbudowują kolejne slice'y roadmapy: S-02 (wynik + data ceny),
S-03 (konfrontacja), S-04 (wynik zamknięcia) (`context/foundation/roadmap.md`). Jeśli docelowy
widok jest inny, pkt 5 trzeba przeliczyć; pkt 1–4 nie zależą od tego wyboru.

## Summary

- Jedyny plik stylów w `src/` to **`src/styles/global.css`** (124 linie), importowany wyłącznie
  w `src/layouts/Layout.astro:2`. Definiuje **32** zmienne w `:root` i **31** w `.dark`
  (`.dark` nie nadpisuje `--radius`).
- `@theme inline` (`global.css:75-111`) publikuje **35** zmiennych: 31 `--color-*` (każdy kolor
  z `:root` ma odpowiednik) + 4 `--radius-*` wyliczane z `--radius`. Wszystkie 35 wartości to
  `var(...)`/`calc(var(...))` — brak surowych kolorów w `@theme inline`, więc podział
  wartość/publikacja jest poprawny.
- `src/components/ui/` zawiera **2** pliki: `button.tsx` (shadcn) i `LibBadge.astro`
  (pozostałość startera, zero importów).
- **Token source istnieje, ale widoki go nie czytają.** W inspected `src/**` klasy semantyczne
  występują tylko w `button.tsx` (26 dopasowań) i w `global.css` (`@layer base`). **13** plików
  używa klas palety (`purple-*`, `blue-*`, `red-*`, `pink-*`, `indigo-*`), a 14. (`PasswordToggle.tsx`)
  samych `white/*`. To wariant „fresh starter whose screens ignore its own
  tokens” ze skilla 10x-ui.
- **Pułapka motywu**: klasa `.dark` nie jest nigdzie aplikowana (brak `class="dark"` w
  `src/**`), więc aktywne są jasne wartości `:root` (`body` = `bg-background` → biały,
  `global.css:121-123`). Widoki wyglądają ciemno tylko dzięki `bg-cosmic` (surowy hex,
  `global.css:113-115`) i ręcznym `text-white`. Mechaniczna zamiana klas na semantyczne bez
  włączenia `.dark` zmieni wygląd na jasny.
- Dla dashboardu brakuje prymitywów: **Table, Badge, Card** (wyświetlanie danych) oraz tokenu
  dla wyniku dodatniego (jest tylko `--destructive`) — potrzebnego od S-02.

## Detailed Findings

### 1. Główny plik stylów i zmienne

Ścieżka: `investments-diary/src/styles/global.css`. To jedyny `*.css` w `src/` (find po
`src/`), importowany tylko przez `src/layouts/Layout.astro:2`. Na górze: `@import "tailwindcss"`,
`@import "tw-animate-css"`, `@custom-variant dark (&:is(.dark *))` (`global.css:1-4`).
Konfiguracja shadcn: `components.json` — `style: new-york`, `baseColor: neutral`,
`cssVariables: true`, `tailwind.css: src/styles/global.css`.

**`:root` (`global.css:6-39`) — 32 zmienne** (wszystkie kolory to odcienie szarości `oklch(L 0 0)`
poza `--destructive` i `--chart-*`):

| Grupa | Zmienne |
| --- | --- |
| Promień | `--radius` (0.625rem) |
| Powierzchnie | `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground` |
| Role | `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive` |
| Kontrolki | `--border`, `--input`, `--ring` |
| Wykresy | `--chart-1` … `--chart-5` |
| Sidebar | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` |

**`.dark` (`global.css:41-73`) — 31 zmiennych**: ten sam zestaw minus `--radius`.

Braki w zestawie (obserwacja, nie błąd konfiguracji): nie ma `--destructive-foreground`
(button `destructive` używa `text-white`, `button.tsx:14`) ani żadnej roli „pozytywnej”
(`--success`/`--positive`). Nie ma tokenów fontu ani spacingu — obowiązuje domyślna skala Tailwind.

### 2. Publikacja w `@theme inline`

Blok `@theme inline` (`global.css:75-111`) — **35 zmiennych, wszystkie poprawnie opublikowane**:

- `--radius-sm|md|lg|xl` (`global.css:76-79`) — `calc(var(--radius) ± Npx)` / `var(--radius)`.
- 31 × `--color-<nazwa>: var(--<nazwa>)` (`global.css:80-110`) dla każdej zmiennej kolorowej z
  `:root`: background, foreground, card(+fg), popover(+fg), primary(+fg), secondary(+fg),
  muted(+fg), accent(+fg), destructive, border, input, ring, chart-1…5, sidebar oraz 7 wariantów
  sidebar-*.

Sprawdzenie: każda z 32 zmiennych `:root` występuje jako `var(--…)` w `global.css`; żadna
wartość w `@theme inline` nie jest surowym kolorem. Zatem `bg-primary`, `text-muted-foreground`,
`border-border`, `ring-ring`, `rounded-lg` itd. istnieją jako utility i przełączałyby się z
`.dark` — gdyby `.dark` było aplikowane (patrz pułapka niżej).

Poza systemem tokenów: `@utility bg-cosmic` (`global.css:113-115`) — gradient z trzech surowych
hexów `#0a0e1a, #0f1529, #0a0e1a`; nie reaguje na motyw. `@layer base` (`global.css:117-124`)
ustawia `border-border outline-ring/50` na `*` oraz `bg-background text-foreground` na `body`.

### 3. Komponenty w `src/components/ui`

`ls src/components/ui` → **2 pliki**:

| Plik | Pochodzenie | Tokeny | Importy |
| --- | --- | --- | --- |
| `button.tsx` | shadcn (cva + Radix `Slot`); warianty default/destructive/outline/secondary/ghost/link, rozmiary default/sm/lg/icon (`button.tsx:7-33`) | semantyczne; jedyny literał `text-white` w wariancie destructive (`button.tsx:14`) | 1 — `src/components/auth/SubmitButton.tsx:3` |
| `LibBadge.astro` | starter (badge biblioteki z wersją) | paleta: `bg-blue-900/50 text-blue-200`, `bg-purple-500/30 text-purple-200` (`LibBadge.astro:10,12`) | 0 (grep po `src/`) |

Uwaga: `SubmitButton` importuje `Button`, ale nadpisuje jego kolory przez `className`
(`bg-purple-600 … text-white hover:bg-purple-500`, `SubmitButton.tsx:18`), więc wariant
`default` (`bg-primary`) nie jest widoczny nigdzie w aplikacji. Wszystkie inne przyciski/linki-
przyciski są ręcznie stylowanymi `<a>`/`<button>` (np. `dashboard.astro:34-47,57-62`).

Prymitywy-kandydaci żyjące poza `ui/`: `components/auth/FormField.tsx` (input z ikoną, label,
błąd), `ServerError.tsx` (alert błędu), `PasswordToggle.tsx`, `SubmitButton.tsx`. Są
reużywane przez formularz pozycji (`PositionForm.tsx:3-5`) — de facto współdzielone, ale
umieszczone w `auth/` i bez tokenów. Zainstalowane paczki Radix: tylko `react-slot` i
`react-compose-refs` (`node_modules/@radix-ui`). Katalog `src/hooks/` nie istnieje.

### 4. Pliki z twardo zakodowanymi kolorami

Metoda: grep w `src/**` po `(bg|text|border|ring|from|via|to|fill|stroke|outline|divide|…)-<paleta Tailwind>-<odcień>`,
`-(white|black)` oraz hex/`rgb()`/`hsl()`/arbitralnych `[#…]`. Brak dopasowań arbitralnych
`bg-[#…]`. Liczby = liczba dopasowań klas (nie linii).

| Plik | Paleta | white/black | Najczęstsze klasy | Rola (widok) |
| --- | --- | --- | --- | --- |
| `src/pages/dashboard.astro` | 14 | 12 | `from-blue-200 to-purple-200` (h1, :25), `text-blue-100/60|80`, `bg-purple-600 hover:bg-purple-500` (CTA, :36,:59), `bg-purple-500/30 text-purple-100` (badge kategorii, :100), `bg-white/10 border-white/10` (karta, :22) | **docelowy widok** |
| `src/components/positions/PositionForm.tsx` | 10 | 5 | `text-blue-100/80` (label, :151,:200), `border-red-400/60 focus:ring-red-400` / `focus:ring-purple-400` (:167,:215), `text-red-300` (:45), `[&>option]:text-black` (:166) | formularz nowej pozycji |
| `src/components/Welcome.astro` | 15 | 13 | `from-blue-200 via-purple-200 to-pink-200` (:22), `bg-purple-600` (:31), poświaty `bg-purple-500/20`, `bg-blue-500/15`, `bg-indigo-400/10` (:7-9) + inline `rgba()` (:14) | landing `/` |
| `src/components/Topbar.astro` | 10 | 3 | `text-purple-300 hover:text-purple-100` (:10,:14,:24,:27), `text-blue-100/70` | **0 importów** |
| `src/components/auth/FormField.tsx` | 5 | 4 | `text-blue-100/80` (:43), `border-red-400/60 focus:ring-red-400` / `focus:ring-purple-400` (:63), `text-red-300` (:69), `bg-white/10 text-white placeholder-white/40` (:6) | wspólny input |
| `src/components/ui/LibBadge.astro` | 4 | 0 | `bg-blue-900/50 text-blue-200`, `bg-purple-500/30 text-purple-200` | **0 importów** |
| `src/components/auth/ServerError.tsx` | 3 | 0 | `bg-red-900/30 border-red-500/30 text-red-300` (:11) | wspólny alert |
| `src/pages/auth/confirm-email.astro` | 4 | 3 | gradient h1 (:25), `text-purple-300` (:29) | auth |
| `src/pages/auth/signin.astro` | 4 | 3 | gradient h1 (:11), `text-blue-100/60` (:15), `text-purple-300` (:17) | auth |
| `src/pages/auth/signup.astro` | 4 | 3 | jak signin (:11,:15,:17) | auth |
| `src/pages/dashboard/new.astro` | 4 | 3 | gradient h1 (:70), `text-purple-300` (:75), karta `bg-white/10` (:69) | nowa pozycja |
| `src/components/auth/SubmitButton.tsx` | 2 | 2 | `bg-purple-600 hover:bg-purple-500 text-white` (:18) nadpisuje `Button`, spinner `border-white/30` (:22) | wspólny submit |
| `src/components/auth/SignUpForm.tsx` | 1 | 0 | `text-blue-100/50` (:59) | auth |
| `src/components/auth/PasswordToggle.tsx` | 0 | 2 | `text-white/40 hover:text-white/70` (:13) | auth |

Suma: **14** plików w tabeli — 13 z klasami palety + `PasswordToggle.tsx` z samym `white/*`.
Poza tabelą: `button.tsx` ma jeden `text-white` (`button.tsx:14`), poza tym jest semantyczny. Dodatkowe surowe kolory poza klasami: `global.css:114` (hex w `bg-cosmic`, używany w
6 plikach: `Welcome.astro:5`, `dashboard.astro:21`, `dashboard/new.astro:68`,
`auth/signin.astro:9`, `auth/signup.astro:9`, `auth/confirm-email.astro:22`) oraz
`Welcome.astro:14` (inline `rgba()` w `style`).

Powtarzające się wzorce (kandydaci na mapowanie ról):

| Literał | Rola, którą pełni | Token-kandydat |
| --- | --- | --- |
| `bg-purple-600 hover:bg-purple-500 text-white` | główna akcja | `bg-primary text-primary-foreground hover:bg-primary/90` (= `Button` default) |
| `text-blue-100/60`, `/70`, `/80`, `/50` | tekst drugorzędny (4 różne przezroczystości) | `text-muted-foreground` |
| `text-purple-300 hover:text-purple-100` | link | `text-primary` / `Button variant="link"` |
| `bg-white/10 border-white/10 text-white` | karta / panel | `bg-card text-card-foreground border-border` |
| `border-white/20 bg-white/10` | input | `border-input bg-transparent` / `dark:bg-input/30` |
| `focus:ring-purple-400` | focus | `ring-ring` |
| `red-300`, `red-400/60`, `red-500/30`, `red-900/30` | błąd | `destructive` (+ `/opacity`) |
| `from-blue-200 to-purple-200 bg-clip-text` | nagłówek | brak tokenu — decyzja (usunąć lub `text-foreground`) |
| `bg-purple-500/30 text-purple-100` (pill) | etykieta kategorii | `Badge variant="secondary"` |

### 5. Brakujące prymitywy dla docelowego widoku (`dashboard.astro`)

Co widok renderuje dziś (`dashboard.astro:20-112`): kartę-kontener, nagłówek + email, dwa
przyciski-akcje (link „New investment”, submit „Sign out”), pusty stan z CTA, tabelę 6 kolumn
z liczbami `tabular-nums` i pillem kategorii. Każdy z tych elementów jest zbudowany ręcznie.

| Prymityw | Status | Gdzie potrzebny | Uwagi |
| --- | --- | --- | --- |
| **Table** (`Table/Header/Row/Head/Body/Cell`) | brak | `dashboard.astro:65-108` | shadcn `table` to czyste elementy HTML + klasy (bez Radix). S-02 dokłada kolumny wynik/data ceny. |
| **Badge** | brak (`LibBadge` to nie to — inny cel, paleta, 0 importów) | pill kategorii `dashboard.astro:100-102`; od S-08 znacznik „removed” | shadcn `badge` wymaga tylko `Slot` (jest). |
| **Card** | brak | kontener `dashboard.astro:22`, pusty stan `:53` | ten sam wzorzec w 5 innych stronach (`new.astro:69`, `signin.astro:10`, …). |
| **Button** jako link | jest (`asChild` + `Slot`), nieużywany w widoku | CTA `:34-39`, `:57-62`; sign-out `:42-47` | brakuje nie komponentu, a jego użycia. Uwaga: `button.tsx` to `.tsx` — w `.astro` bez `client:*` renderuje się statycznie, co jest zgodne z konwencją z `CLAUDE.md` tylko jeśli nie ma interaktywności (tu jej nie ma); alternatywa to `buttonVariants()` w klasie `<a>`. |
| **Empty state** | brak | `dashboard.astro:52-63`; US-01 wymaga pustego stanu też w konfrontacji (S-03) | może być wzorzec na Card, nie osobny komponent. |
| **Token „positive/negative”** | brak w `global.css` | wynik zysk/strata od S-02 (FR-006), S-03, S-04 | jest tylko `--destructive`; zysk nie ma roli — inaczej wróci `text-green-*`. |
| Input / Label / Textarea / Select / Alert | brak w `ui/` (zastępniki w `auth/`) | **nie** w dashboardzie; potrzebne w `PositionForm` i przy aktualizacji ceny (S-02) | poza docelowym widokiem; odnotowane, nie wymagane do wyświetlania danych. |

## Code References

- `src/styles/global.css:1-4` — importy Tailwind/tw-animate, `@custom-variant dark`
- `src/styles/global.css:6-39` — `:root` (32 zmienne)
- `src/styles/global.css:41-73` — `.dark` (31 zmiennych)
- `src/styles/global.css:75-111` — `@theme inline` (35 zmiennych, wszystkie `var()`)
- `src/styles/global.css:113-115` — `@utility bg-cosmic` z surowym hexem
- `src/styles/global.css:117-124` — `@layer base` (`body` → `bg-background text-foreground`)
- `src/layouts/Layout.astro:2,12,19` — jedyny import CSS; `<html lang="en">` i `<body>` bez klasy `dark`
- `src/components/ui/button.tsx:7-33` — warianty shadcn Button
- `src/components/auth/SubmitButton.tsx:18` — nadpisanie kolorów `Button` paletą
- `src/pages/dashboard.astro:22,25,36,59,65-108,100` — karta, gradient h1, CTA, tabela, pill
- `components.json` — shadcn new-york / neutral / `cssVariables: true`

## Architecture Insights

- **Dwa systemy kolorów obok siebie.** Tokeny shadcn (neutral, jasne + ciemne) są kompletne i
  poprawnie opublikowane, ale UI zbudowano na „cosmic glass” z palety purple/blue na stałym
  ciemnym tle. To estetyka startera, przeniesiona dalej z planem S-01 („keeping the page's
  visual style”, `context/archive/2026-09-25-record-first-investment/plan.md:279`).
- **Ciemność nie pochodzi z `.dark`.** Ponieważ `.dark` nie jest aplikowane, migracja do klas
  semantycznych wymaga najpierw decyzji: (a) dodać `class="dark"` do `<html>` w `Layout.astro`
  i zostać przy ciemnym wyglądzie, czy (b) przejść na jasny motyw. Bez tej decyzji pierwszy
  podmieniony widok „zrobi się biały” — to nie regres w kodzie, tylko ujawnienie, że tokeny
  nigdy nie były aktywne w wersji ciemnej.
- **Wartości neutral są achromatyczne.** `--primary` to `oklch(0.205 0 0)` (prawie czarny) /
  `oklch(0.922 0 0)` w `.dark`. Zamiana `bg-purple-600` → `bg-primary` usunie fiolet z marki.
  Jeśli fiolet ma zostać, należy go przenieść do `--primary`/`--ring` (w `:root` i `.dark`),
  a nie zostawiać w widokach.
- **Współdzielone prymitywy formularzy leżą w `auth/`.** `PositionForm` importuje
  `FormField`, `ServerError`, `SubmitButton` z `components/auth/`. To kategoria „missing shared
  component” — przy migracji tokenów te 3 pliki są dźwignią (poprawione raz, działają w 2+ widokach).
- **Martwy kod startera**: `Topbar.astro` i `LibBadge.astro` mają zero importów — nie wymagają
  migracji, kandydaci do usunięcia (decyzja użytkownika).

## Historical Context (from prior changes)

- `context/archive/2026-09-25-record-first-investment/plan.md:279` — dashboard miał zachować
  istniejący styl strony; żadnej decyzji o tokenach/motywie. Grep po `context/archive/**`,
  `context/changes/bootstrap-verification/**`, `context/foundation/health-check.md` dla
  `cosmic|purple|token|shadcn|semantic` nie znalazł innych ustaleń.
- `context/foundation/lessons.md` nie istnieje — brak priorów.

## Related Research

Nie dotyczy — brak innych `research.md` w `context/changes/**` i `context/archive/**`.

## Open Questions

1. **Który widok jest docelowy?** Przyjęto `dashboard.astro`; potwierdź w `change.md`
   (10x-ui: jeden widok na zmianę).
2. **Motyw**: ciemny przez `class="dark"` na `<html>` czy przejście na jasny? Blokuje fazę tokenów. -
3. **Marka**: zostaje fiolet (→ wartości `--primary`/`--ring`/`--accent` w obu motywach) czy
   neutral shadcn? Potrzebne źródło wartości (motyw/preset) do zdeponowania w folderze zmiany.
4. **Tło `bg-cosmic`**: zostaje jako dekoracja, staje się tokenem (`--background` z gradientem
   nie zadziała jako kolor — wymaga osobnej zmiennej) czy znika?
5. **Gradientowe nagłówki** (`from-blue-200 to-purple-200 bg-clip-text`, 6 plików): bez tokenu —
   usunąć czy zdefiniować?
6. **Token wyniku dodatniego** (np. `--success`): dodać teraz, czy w S-02 razem z wynikiem?
7. **`Topbar.astro`, `LibBadge.astro`**: usunąć jako martwy kod czy zostawić?
