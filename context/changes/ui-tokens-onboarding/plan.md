# Dashboard na tokenach (ui-tokens-onboarding) — Implementation Plan

## Overview

Przepinamy jeden widok, `src/pages/dashboard.astro` (lista pozycji, FR-010), z ręcznej palety
purple/blue na tokeny shadcn, które już istnieją w `src/styles/global.css`. Fiolet marki trafia do
tokenów (`--primary`, `--primary-foreground`, `--ring`), aplikacja zaczyna działać w motywie
`.dark`, a brakujące prymitywy (Table, Badge, Card) dochodzą przez `npx shadcn add`. Bramką
wizualną jest dev-only kitchen sink. Cel: kolejne slice'y (S-02 wynik i data ceny, S-03
konfrontacja) budują na tokenach i komponentach z repo, a nie na kolejnych literałach palety.

## Current State Analysis

Na podstawie `context/changes/ui-tokens-onboarding/research.md`:

- Tokeny są kompletne i poprawnie opublikowane: 32 zmienne w `:root` (`global.css:6-39`), 31 w
  `.dark` (`global.css:41-73`), 35 w `@theme inline`, wszystkie przez `var()` (`global.css:75-111`).
- Widoki ich nie czytają. Klasy semantyczne są tylko w `button.tsx`, a 13 plików używa palety.
  Na samym dashboardzie jest 14 klas palety i 12 klas `white/*`.
- `.dark` nie jest aplikowane (`Layout.astro:12`, `<html lang="en">`). Ciemny wygląd pochodzi z
  `bg-cosmic` (surowy hex, `global.css:113-115`) i ręcznego `text-white`.
- Paleta neutral ma achromatyczne `--primary`, więc sama zamiana klas usunęłaby fiolet.
- `src/components/ui/` zawiera tylko `button.tsx` (shadcn) i nieużywany `LibBadge.astro`.
- Repo nie ma frameworka testowego ani Playwrighta. Poprzeczkę stawia skill `verify`
  (`.claude/skills/verify/SKILL.md`: astro sync → lint → astro check → build).

## Desired End State

- `/dashboard` renderuje się wyłącznie z klas semantycznych (`bg-background`, `bg-card`,
  `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`…). W
  `dashboard.astro` i nowych komponentach widoku nie ma żadnej klasy palety Tailwind, żadnego
  `white/*` ani hexa.
- Fiolet pochodzi z `--primary`/`--ring` w obu motywach. Wartości i ich źródło są zdeponowane w
  `context/changes/ui-tokens-onboarding/tokens.md`.
- `<html>` ma `class="dark"`. Pozostałe 6 widoków (landing, auth ×3, `dashboard/new`) wygląda tak
  samo jak przed zmianą.
- `src/components/ui/` zawiera `table.tsx`, `badge.tsx`, `card.tsx`, a `CLAUDE.md` mówi wprost, że
  prymitywy z `ui/` mogą renderować się bez `client:*`.
- `/dev/kitchen-sink` pokazuje widok we wszystkich nazwanych stanach w trybie dev i zwraca 404 w
  buildzie produkcyjnym. Screenshoty (desktop + 390px) leżą w folderze zmiany.
- `charges.md` w folderze zmiany zawiera listę zarzutów: zaadresowane i odroczone.

### Key Discoveries:

- `button.tsx:7-33`: warianty `default` (`bg-primary text-primary-foreground`) i `outline`
  już istnieją, a `buttonVariants` jest eksportowane (`button.tsx:50`).
- `SubmitButton.tsx:18` nadpisuje kolory `Button` paletą. To poza zakresem (formularze), ale po
  zmianie `--primary` wariant default będzie fioletowy, więc nadpisanie da się usunąć w
  przyszłej zmianie bez zmiany wyglądu.
- `middleware.ts:4,14-17`: `PROTECTED_ROUTES = ["/dashboard"]` (prefiks). `/dev/*` nie jest
  chronione, więc kitchen sink zabezpiecza wyłącznie własny guard DEV.
- `dashboard/new.astro:2-4`: top-level `return` we frontmatterze crashuje regułę
  `@typescript-eslint/no-misused-promises`. Repo obchodzi to wyłączeniem reguły w pliku.
- Wartości fioletu z Tailwind (`node_modules/tailwindcss/theme.css:169-172`): purple-400
  `oklch(71.4% 0.203 305.504)`, purple-500 `oklch(62.7% 0.265 303.9)`, purple-600
  `oklch(55.8% 0.288 302.321)`. Dziś CTA = purple-600 + biały tekst, focus = `ring-purple-400`.

## What We're NOT Doing

- Migracja pozostałych 6 widoków (landing, `auth/*`, `dashboard/new`) i ich `bg-cosmic`.
  Utility `bg-cosmic` zostaje w `global.css` dla tych widoków.
- Migracja komponentów formularzy z `components/auth/` (`FormField`, `ServerError`,
  `SubmitButton`, `PasswordToggle`) i `PositionForm.tsx`, oraz przeniesienie ich do `ui/`.
- Dodanie Input/Label/Textarea/Select/Alert do `ui/`.
- Token `--success`/`--positive`. Należy do S-02 razem z wyświetlaniem wyniku.
- Usunięcie martwego `Topbar.astro` i `LibBadge.astro`.
- Przełącznik motywu, `prefers-color-scheme`, weryfikacja jasnego motywu na widokach.
- Instalacja Playwrighta lub innego test runnera.
- Zmiany wartości `--chart-*`, `--sidebar-*`, `--radius`, fontów i spacingu.

## Implementation Approach

Kolejność z 10x-ui: najpierw kontrakt (wartości i prymitywy), potem jeden widok, potem stany i
bramka. Faza 1 zmienia globalne tokeny i włącza `.dark`, ale nie powinna zmienić wyglądu
żadnego widoku. Pozostałe widoki malują własne tło i kolory paletą, a jedyny konsument
`--primary` (`Button` w `SubmitButton`) ma kolory nadpisane. Dzięki temu regresję fazy 1 da się
sprawdzić porównaniem „przed/po” każdego widoku. Faza 2 dotyka tylko dashboardu, a faza 3 dodaje
kod wyłącznie dla trybu dev.

## Critical Implementation Details

- **`asChild` nie działa z `.astro`.** Astro przekazuje dzieci komponentu React jako statyczny
  HTML, więc `Slot` w `Button asChild` nie dostaje elementu React do sklonowania. Linki-przyciski w
  `.astro` mają być zwykłym `<a class={buttonVariants({...})}>` (import `buttonVariants` z
  `@/components/ui/button`). To samo dotyczy przycisku „Sign out” w natywnym `<form>`:
  `<button type="submit" class={buttonVariants({ variant: "outline" })}>`, bez `client:*`.
- **`shadcn add` może dodać zależność.** Nowsze szablony importują `Slot` z pakietu `radix-ui`
  zamiast `@radix-ui/react-slot` (który już jest w `package.json`). Jeśli CLI doda nowy pakiet
  Radix, przepnij import na istniejący `@radix-ui/react-slot`, zamiast trzymać dwie kopie `Slot`.
  CLI może też zaproponować nadpisanie `button.tsx` lub `global.css`: odmów obu.
- **Guard DEV na kitchen sinku** musi być top-level `return` we frontmatterze, więc wymaga
  tego samego wyłączenia reguły co `dashboard/new.astro:2-4`. `import.meta.env.DEV` jest
  statycznie `false` w `astro build`, więc strona w buildzie zawsze odpowiada 404.

## Phase 1: Contract — tokeny i prymitywy

### Overview

Lista zarzutów, wartości fioletu w tokenach, globalne `.dark`, prymitywy Table/Badge/Card i
reguła w `CLAUDE.md`. Żaden widok nie zmienia jeszcze wyglądu.

### Changes Required:

#### 1. Lista zarzutów

**File**: `context/changes/ui-tokens-onboarding/charges.md` (nowy)

**Intent**: Zapisać 3–5 zarzutów wobec dashboardu, każdy z `file:line` i jednym zdaniem o
wpływie na użytkownika, oraz listę odroczonych. To wejście dla faz 2–3 i dla `/10x-impl-review`.

**Contract**: Tabela z kolumnami: kategoria (missing tokens / missing shared component /
accidental architecture), `file:line`, wpływ na użytkownika, faza lub „deferred: powód”. Minimum:
- missing tokens: `dashboard.astro:25,28,36,59,100` (fiolet i 4 przezroczystości `blue-100`
  poza tokenami, więc kolor nie podąża za motywem);
- missing tokens: `dashboard.astro:21` + `global.css:114` (tło z surowego hexa);
- missing shared component: `dashboard.astro:34-47,57-62` (ręczne przyciski zamiast `Button`),
  `:100` (pill zamiast Badge), `:65-108` (tabela bez prymitywu), `:22,53` (karty bez Card);
- accidental architecture: `Layout.astro:12` (`.dark` nigdy nie aplikowane, ciemne wartości
  tokenów nie docierają do użytkownika); wejścia sprawdzone: wylogowany → redirect
  (`middleware.ts:14-17`), brak danych → pusty stan (`dashboard.astro:52-63`), bezpośredni link → OK;
- focus: ręczne przyciski nie mają stylu `focus-visible`, zostaje tylko `outline-ring/50` z
  `global.css:119`.
Odroczone: pozycje z „What We're NOT Doing”, które dotyczą zarzutów (formularze, inne widoki,
`--success`, martwy kod).

#### 2. Wartości fioletu

**File**: `src/styles/global.css` (bloki `:root` i `.dark`); `context/changes/ui-tokens-onboarding/tokens.md` (nowy)

**Intent**: Przenieść kolor marki do tokenów ról, żeby `bg-primary` i `ring-ring` dawały dzisiejszy
fiolet. Zmieniamy tylko trzy zmienne w każdym motywie; reszta neutral zostaje.

**Contract**:

| Zmienna | `:root` | `.dark` |
| --- | --- | --- |
| `--primary` | `oklch(0.558 0.288 302.321)` (purple-600) | `oklch(0.558 0.288 302.321)` (purple-600) |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` |
| `--ring` | `oklch(0.627 0.265 303.9)` (purple-500) | `oklch(0.714 0.203 305.504)` (purple-400) |

`tokens.md` zapisuje tę tabelę, poprzednie wartości neutral, źródło
(`node_modules/tailwindcss/theme.css:169-172`, Tailwind 4.2.x) i uzasadnienie (dzisiejszy CTA i
focus). Obok edytowanego bloku w `global.css` dochodzi jednolinijkowy komentarz wskazujący na
`tokens.md`. `@theme inline` pozostaje bez zmian.

#### 3. Globalny motyw ciemny

**File**: `src/layouts/Layout.astro`

**Intent**: Aktywować wartości `.dark`, żeby tokeny odpowiadały ciemnemu wyglądowi aplikacji.

**Contract**: `<html lang="en" class="dark">`. Nic więcej w Layout.

#### 4. Prymitywy

**File**: `src/components/ui/table.tsx`, `badge.tsx`, `card.tsx` (nowe, przez `npx shadcn add table badge card`)

**Intent**: Dodać brakujące prymitywy ścieżką stacku (`components.json`: new-york, neutral,
`cssVariables`), bez ręcznego pisania.

**Contract**: Trzy pliki w `src/components/ui/`, korzystające wyłącznie z klas semantycznych.
Bez nadpisań `button.tsx`/`global.css` i bez drugiej kopii `Slot` (patrz Critical Implementation
Details). Każda zmiana w `package.json` zostaje zanotowana w `charges.md` lub `tokens.md`.

#### 5. Zwolnienie `ui/` z reguły `client:*`

**File**: `CLAUDE.md` (sekcja `## Conventions`, punkt o Astro components)

**Intent**: Zapisać, że prymitywy shadcn w `src/components/ui/` mogą renderować się statycznie z
`.astro` bez `client:*`. Powód: ten sam zestaw obsługuje widoki Astro i wyspy React (S-03 użyje
Table/Badge wewnątrz `PositionForm`).

**Contract**: Jedno zdanie dopisane do istniejącego punktu. Zwolnienie obejmuje wyłącznie
`src/components/ui/`, a komponenty domenowe nadal podlegają regule.

### Success Criteria:

#### Automated Verification:

- Sekwencja skilla `verify` przechodzi: `npx astro sync && npm run lint && npx astro check && npm run build`
- `ls src/components/ui` zwraca `LibBadge.astro badge.tsx button.tsx card.tsx table.tsx`
- `grep -nE '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]' src/components/ui/table.tsx src/components/ui/badge.tsx src/components/ui/card.tsx` nie zwraca nic
- `grep -c 'class="dark"' src/layouts/Layout.astro` zwraca 1
- `node_modules/@radix-ui` nie ma nowego pakietu z `Slot` poza `react-slot`, a `package.json` nie ma zależności `radix-ui`

#### Manual Verification:

- `charges.md` zawiera 3–5 zarzutów z `file:line` i wpływem na użytkownika oraz sekcję odroczonych
- `tokens.md` zawiera wartości obu motywów, poprzednie wartości i źródło
- Landing, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard/new` i `/dashboard` wyglądają tak samo jak przed fazą (porównanie przed/po w `npm run dev`); przycisk „Sign in” nadal jest fioletowy
- Zdanie w `CLAUDE.md` jest ograniczone do `src/components/ui/`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przez człowieka, zanim przejdziesz do fazy 2.

---

## Phase 2: One view — dashboard na tokenach

### Overview

`dashboard.astro` przechodzi na tokeny i prymitywy z repo. Tabela i pusty stan trafiają do
komponentów przyjmujących dane przez propsy, żeby faza 3 mogła je wyrenderować z fixture'ów.

### Changes Required:

#### 1. Tabela pozycji

**File**: `src/components/positions/PositionsTable.astro` (nowy)

**Intent**: Wydzielić tabelę z `dashboard.astro:65-108` razem z formatowaniem liczb i dat,
zbudowaną z `Table*` i `Badge` z `ui/`.

**Contract**: Props `{ positions: PositionListItem[] }` (typ z `src/types.ts:10-15`). Te same 6
kolumn, `tabular-nums` i wyrównanie do prawej dla liczb, „—” dla `null`. Kategoria jako
`<Badge variant="secondary">`. Formatery `Intl.NumberFormat`/`DateTimeFormat` przeniesione
bez zmian z `dashboard.astro:11-17`. Tekst drugorzędny w `text-muted-foreground`.

#### 2. Pusty stan

**File**: `src/components/positions/PositionsEmptyState.astro` (nowy)

**Intent**: Wydzielić pusty stan z `dashboard.astro:52-63` jako Card z tym samym zdaniem i CTA.

**Contract**: Bez propsów. Tekst w `text-muted-foreground`, CTA „Record your first investment”
jako `<a href="/dashboard/new" class={buttonVariants()}>`. Copy bez zmian.

#### 3. Widok

**File**: `src/pages/dashboard.astro`

**Intent**: Złożyć widok z Card, nowych komponentów i `buttonVariants`, zastępując wszystkie
klasy palety, `white/*` i `bg-cosmic`.

**Contract**:
- tło strony: `bg-background` zamiast `bg-cosmic` (`:21`);
- kontener: Card (`:22`), bez `backdrop-blur` i `bg-white/10`;
- `h1` „Your positions”: `text-foreground`, bez gradientu i `bg-clip-text` (`:25`);
- „Signed in as”: `text-muted-foreground`, email w `text-foreground font-semibold` (`:28-29`);
- „New investment”: `<a class={buttonVariants()}>`, widoczny tylko gdy `positions.length > 0` (bez zmiany warunku, `:33`);
- „Sign out”: `<button type="submit" class={buttonVariants({ variant: "outline" })}>` w tym samym `<form method="POST" action="/api/auth/signout">`;
- gałąź `positions.length === 0` → `PositionsEmptyState`, w przeciwnym razie `PositionsTable`.
Pobieranie danych (`:6-9`) bez zmian.

### Success Criteria:

#### Automated Verification:

- Sekwencja skilla `verify` przechodzi
- `grep -nE '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]|(white|black)(/|\b)|bg-cosmic|#[0-9a-fA-F]{3,8}' src/pages/dashboard.astro src/components/positions/PositionsTable.astro src/components/positions/PositionsEmptyState.astro` nie zwraca nic
- `npm run smoke` przechodzi przeciwko `npm run dev` i lokalnemu Supabase (dashboard i sign-out są częścią spaceru auth)

#### Manual Verification:

- `/dashboard` z kontem z pozycjami: 6 kolumn, kategoria jako badge, „New investment” fioletowy, „Sign out” jako outline
- `/dashboard` z pustym kontem: Card z tym samym zdaniem i fioletowym CTA, bez „New investment” w nagłówku
- Wylogowany wchodzi na `/dashboard` → redirect do `/auth/signin`
- Tab przez nagłówek: focus na „New investment” i „Sign out” jest widoczny (pierścień `--ring`)
- Widok przy 390px: tabela przewija się poziomo w swoim kontenerze, a strona nie ma poziomego scrolla

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przez człowieka, zanim przejdziesz do fazy 3.

---

## Phase 3: States — kitchen sink i bramka wizualna

### Overview

Strona dev-only renderuje widok we wszystkich nazwanych stanach naraz, z fixture'ów, bez
Supabase. Screenshoty z niej są bramką tej zmiany.

### Changes Required:

#### 1. Fixture'y

**File**: `src/components/positions/fixtures.ts` (nowy)

**Intent**: Dane, które wymuszają przypadki brzegowe tabeli.

**Contract**: Eksport tablic `PositionListItem[]`: kilka typowych wierszy; wiersz z
`quantity: null` i `broker_label: null`; wiersz z długą nazwą instrumentu (100 znaków, limit z
`PositionForm.tsx:78`) i długą kategorią (60 znaków, `PositionForm.tsx:89`); liczby z 8
miejscami po przecinku. Bez importów z Supabase.

#### 2. Strona kitchen sink

**File**: `src/pages/dev/kitchen-sink.astro` (nowy)

**Intent**: Pokazać na jednym ekranie stany widoku: default (z wierszami), empty, długie teksty
oraz przyciski w stanach default, hover, focus i disabled, w tym samym Layout (`.dark`).

**Contract**: Gdy `!import.meta.env.DEV`, top-level `return new Response(null, { status: 404 })`
(z wyłączeniem reguły jak w `dashboard/new.astro:2-4`). Sekcje z nagłówkami nazw stanów:
`PositionsTable` (typowe, null-e, długie teksty), `PositionsEmptyState`, rząd
`buttonVariants()` / `{ variant: "outline" }` z wymuszonymi stanami (statyczna klasa hover/focus-visible
lub atrybut `disabled`) oraz `Badge`. Stany error i loading nie dotyczą tego widoku (brak
formularza i ładowania po stronie klienta); strona to wypisuje.

#### 3. Screenshoty

**File**: `context/changes/ui-tokens-onboarding/screens/` (nowy katalog)

**Intent**: Zdeponować dowód bramki dla `/10x-impl-review`.

**Contract**: `kitchen-sink-desktop.png` (≥1280px), `kitchen-sink-390.png`, `dashboard-after.png` oraz
`dashboard-before.png`, zrobiony przed rozpoczęciem fazy 2 (faza 1 nie zmienia wyglądu dashboardu).

### Success Criteria:

#### Automated Verification:

- Sekwencja skilla `verify` przechodzi
- `grep -n 'import.meta.env.DEV' src/pages/dev/kitchen-sink.astro` wskazuje guard zwracający 404 przed jakimkolwiek renderem
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/dev/kitchen-sink` na `npm run dev` zwraca 200
- Grep z fazy 2 rozszerzony o `src/pages/dev/kitchen-sink.astro` i `src/components/positions/fixtures.ts` nie zwraca nic

#### Manual Verification:

- Na Vercel preview tego brancha `curl -s -o /dev/null -w '%{http_code}' <preview-url>/dev/kitchen-sink` zwraca 404 (`vercel dev` się nie nadaje, bo uruchamia `astro dev` z `DEV=true`)
- Kitchen sink pokazuje wszystkie sekcje stanów z podpisami; długie teksty nie rozpychają strony przy 390px
- Focus i disabled są wizualnie odróżnialne od default
- Screenshoty leżą w `screens/` i są podpięte w `charges.md` przy odpowiednich zarzutach
- Checklist `ui-quality-checklist` (10x-ui) przejrzana; niezaadresowane punkty zapisane jako odroczone w `charges.md`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie, a potem uruchom `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- Brak. Repo nie ma test runnera i ta zmiana go nie dodaje (decyzja planu).

### Integration Tests:

- `npm run smoke` (faza 2) potwierdza, że sign-up → sign-in → `/dashboard` → sign-out działa po zmianie markupu.

### Manual Testing Steps:

1. Przed fazą 1 zrób screenshoty 6 widoków; po fazie 1 porównaj każdy z nich. Screenshot dashboardu zachowaj jako `screens/dashboard-before.png`.
2. Po fazie 2 sprawdź `/dashboard` z pustym kontem, z kontem z pozycjami i wylogowany.
3. Przejdź Tabem przez nagłówek dashboardu i potwierdź widoczny focus.
4. Po fazie 3 otwórz `/dev/kitchen-sink` w 1280px i 390px i zrób screenshoty do `screens/`.

## Performance Considerations

Prymitywy React renderują się statycznie (bez `client:*`), więc dashboard nie wysyła nowego JS
do przeglądarki. `backdrop-blur` znika z kontenera.

## Migration Notes

Nie dotyczy, bez zmian w danych. Rollback to revert commitów, a `tokens.md` zawiera poprzednie
wartości neutral.

## References

- Research: `context/changes/ui-tokens-onboarding/research.md`
- Skill: `.claude/skills/10x-ui/SKILL.md`, checklist `.claude/skills/10x-ui/references/ui-quality-checklist.md`
- Wzorzec guarda i wyłączenia reguły: `src/pages/dashboard/new.astro:2-4,16-18`
- Obecny widok: `src/pages/dashboard.astro:20-112`
- Archiwalna decyzja o stylu: `context/archive/2026-09-25-record-first-investment/plan.md:279`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract — tokeny i prymitywy

#### Automated

- [x] 1.1 Sekwencja skilla `verify` przechodzi
- [x] 1.2 `ls src/components/ui` zwraca `LibBadge.astro badge.tsx button.tsx card.tsx table.tsx`
- [x] 1.3 Nowe pliki `ui/` nie zawierają klas koloru palety
- [x] 1.4 `Layout.astro` ma `class="dark"`
- [x] 1.5 Brak drugiej kopii `Slot` i zależności `radix-ui`

#### Manual

- [x] 1.6 `charges.md` zawiera 3–5 zarzutów z `file:line`, wpływem i sekcją odroczonych
- [x] 1.7 `tokens.md` zawiera wartości obu motywów, poprzednie wartości i źródło
- [x] 1.8 Sześć widoków wygląda tak samo jak przed fazą; „Sign in” nadal fioletowy
- [x] 1.9 Zdanie w `CLAUDE.md` ograniczone do `src/components/ui/`

### Phase 2: One view — dashboard na tokenach

#### Automated

- [ ] 2.1 Sekwencja skilla `verify` przechodzi
- [ ] 2.2 Grep palety/white/black/bg-cosmic/hex po plikach widoku nie zwraca nic
- [ ] 2.3 `npm run smoke` przechodzi

#### Manual

- [ ] 2.4 Dashboard z pozycjami: 6 kolumn, badge, fioletowy CTA, outline „Sign out”
- [ ] 2.5 Dashboard pusty: Card z CTA, bez „New investment” w nagłówku
- [ ] 2.6 Wylogowany na `/dashboard` → redirect do `/auth/signin`
- [ ] 2.7 Widoczny focus na przyciskach nagłówka
- [ ] 2.8 390px: tabela przewija się w kontenerze, strona bez poziomego scrolla

### Phase 3: States — kitchen sink i bramka wizualna

#### Automated

- [ ] 3.1 Sekwencja skilla `verify` przechodzi
- [ ] 3.2 Guard `import.meta.env.DEV` zwraca 404 przed renderem
- [ ] 3.3 Kitchen sink zwraca 200 na `npm run dev`
- [ ] 3.4 Grep palety po kitchen sinku i fixture'ach nie zwraca nic

#### Manual

- [ ] 3.5 Vercel preview: `/dev/kitchen-sink` zwraca 404
- [ ] 3.6 Wszystkie sekcje stanów podpisane; długie teksty nie rozpychają 390px
- [ ] 3.7 Focus i disabled odróżnialne od default
- [ ] 3.8 Screenshoty w `screens/` podpięte w `charges.md`
- [ ] 3.9 `ui-quality-checklist` przejrzana; luki zapisane jako odroczone
