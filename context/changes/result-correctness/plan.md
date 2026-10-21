# Result correctness — Implementation Plan

## Overview

Zapewnić dokładność liczb od formularza, przez Supabase, po wynik widoczny użytkownikowi. Pokryć obliczenia, zaokrąglanie, walidację, datę ceny oraz przekazywanie danych do listy, szczegółu, konfrontacji i portfeli.

Złożoność: **wysoka**. Zakres rozszerzono z dodania testów o naprawę utraty precyzji w całym dopuszczonym zakresie `numeric(20,8)`.

## Current State Analysis

Vitest i `npm test` w CI już istnieją (3 pliki, 27 testów w chwili planowania). Parser, transport i obliczenia używają `Number`, co gubi dopuszczone cyfry. Wspólny helper wyniku nie zabezpiecza przekazania właściwych propsów przez widoki. Dokumentacja nadal opisuje brak runnera i zmianę `with-wallet`.

### Key Discoveries

- `src/lib/validation/decimal.ts:8`: konwersja tekstu do Number gubi cyfry.
- `src/lib/result.ts:22` i `src/lib/wallet.ts:26`: wspólne formuły pozycji i portfela.
- Odczyt `::text` zachowuje cyfry w PostgREST; pola nullable wymagają jawnego kontraktu transportu.

## Desired End State

Pełna precyzja ceny, ilości i wartości początkowej od wejścia do obliczeń. Zaokrąglenie dopiero przy wyświetlaniu: dwa miejsca, remisy od zera, zero bez znaku. Każdy wynik wskazuje datę użytej ceny.

## What We're NOT Doing

- Wynik kwotowy pojedynczej pozycji pozostaje niewidoczny; nie zmieniamy formuł ani wyboru pozycji/dat portfela.
- Bez rekonstrukcji historycznych cyfr, zmian SQL/RLS/tras, pełnego audytu RLS, browser E2E, snapshotów stron i hooków.

## Implementation Approach

Na granicach formularzy, DTO, bazy i propsów: kanoniczny tekst dziesiętny z kropką, bez grupowania, wykładnika i zbędnych zer; zero jako `"0"`. Bez konwersji wartości finansowych przez Number.

Natywny BigInt bez nowej biblioteki: wejście w jednostkach skali 8, iloczyny/sumy kwot w skali 16, procent jako dokładny iloraz z dodatnim mianownikiem do formatowania. BigInt nie przechodzi przez granice JSON/hydratacji. Formatowanie używa ilorazu i reszty; ceny/ilości do 8 miejsc, kwoty/procenty 2, angielskie grupowanie i daty UTC.

Odczyty przez `::text`, zapisy tekstowe. Osobny typ API zmienia wyłącznie numeryczne Insert/Update, zachowując optional/nullability. Nie edytować wygenerowanych typów. Zachować request-scoped klienta, relacje, filtry, kolejność i paginację. Adapter odrzuca błędne typy/formaty zamiast podstawiać zero.

## Phase 1: Dokładne operacje i dowód transportu

### Changes Required

**Obszar:** nowy moduł liczb dziesiętnych, testy, adapter API i `npm run test:decimal-db`.

**Intent:** Zapewnić dokładne działania oraz dowód rzeczywistego transportu przed przełączeniem aplikacji.

**Contract:** Kanoniczny tekst, skala 8/16, ilorazy i zaokrąglanie od zera. Lokalny Supabase, dwa tymczasowe konta, admin wyłącznie do przygotowania/sprzątania kont. Odrzucać nielokalny adres, nie resetować bazy. Sprawdzić insert/update/read maksimum, minimum, ostatniej cyfry, null, relacji, paginacji oraz odmowę obcego read/update.

### Success Criteria

#### Automated Verification

- Testy modułu dziesiętnego przechodzą dla dokładnych działań, ilorazów i zaokrąglania.
- `npm run test:decimal-db` potwierdza dokładny transport i izolację testowanych operacji.

## Phase 2: Przełączenie całego przepływu danych

### Changes Required

**Obszar:** parser, walidacje i formularz React; typy domenowe, klient i usługi; obliczenia, formatowanie i odbiorcy.

**Intent:** Zachować wszystkie cyfry i jednakowe reguły klienta/serwera w jednym spójnym przełączeniu.

**Contract:** `parseDecimal` zwraca kanoniczny tekst lub null. Limit 12 cyfr całkowitych i 8 ułamkowych, separator dziesiętny kropka/przecinek. Po trimie dopuścić niegrupowane cyfry lub pierwszą grupę 1–3 i kolejne po 3 cyfry rozdzielone spacją/NBSP/wąską NBSP. Bez spacji w części ułamkowej/przy separatorze, bez wewnętrznych tabulatorów; `1 200,5` poprawne, `1 2` błędne. Ceny/podana ilość dodatnie, starting value >= 0, pusta ilość null. Zachować komunikaty i reguły dat.

Wszystkie odczyty cen/ilości/starting value jako tekst, nullable jawnie zachowane i walidowane. Zapisy tekstowe bez rzutowania na number. Wynik pozycji to dokładny procent i opcjonalna kwota. Portfel sumuje niezaokrąglone kwoty; procent przy zerowym starting value null. Prefill tekstowy. Przenieść istniejące fixture'y/testy do tekstowych DTO, zachowując scenariusze.

### Success Criteria

#### Automated Verification

- `npm test` potwierdza kontrakty walidacji, obliczeń, formatowania i dotychczasowe regresje.
- `npm run test:decimal-db` potwierdza dokładność rzeczywistych usług aplikacji.
- Sekwencja `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build` przechodzi.

## Phase 3: Testy renderu wszystkich powierzchni wyniku

### Changes Required

**Obszar:** testy komponentów i stron.

**Intent:** Wykrywać pomylone pola, daty i sąsiednie rekordy.

**Contract:** Astro Container z rendererem React oraz React SSR konfrontacji. Mockować usługi/klienta, nigdy obliczeń i formatowania. Dashboard, szczegół pozycji, konfrontacja, lista i szczegół portfela. Literalne asercje w konkretnym wierszu/sekcji, co najmniej dwa rekordy z różnymi wynikami/datami. Bez snapshotów całych stron. Zachować No price yet, procent bez ilości, wykluczenia i najstarszą uwzględnioną datę.

### Success Criteria

#### Automated Verification

- Testy renderu potwierdzają literalny wynik i właściwą datę na każdej powierzchni.
- `npm test` przechodzi wraz z testami renderu.

#### Manual Verification

- Lokalny przegląd potwierdza czytelne wyniki, grupowanie liczb i komunikaty błędnych grup tysięcy.

## Phase 4: CI, dokumentacja i końcowa weryfikacja

### Changes Required

**Obszar:** workflow, skrypty i dokumentacja jakości.

**Intent:** Wymagać jednostek/renderu i rzeczywistego transportu na kwalifikujących się PR/push do master.

**Contract:** Zachować runner/bramki; osobny job lokalnego transportu z bezwarunkowym sprzątaniem, bez kluczy w logach. Uaktualnić runner, result-correctness, cookbook niezależnych oczekiwań i verify. Zachować niezwiązane edycje użytkownika i nie zamykać późniejszych faz strategii.

### Success Criteria

#### Automated Verification

- Końcowe `npm test` i `npm run test:decimal-db` przechodzą.
- Końcowa sekwencja statycznej weryfikacji przechodzi.
- PR do `master` uruchamia istniejący job `ci` i nowy job transportu; oba przechodzą.

## Testing Strategy

Literalne, niezależnie policzone oczekiwania, nigdy oczekiwania wyliczane produkcyjnym helperem/wzorem.

| Scenariusz                                       | Oczekiwanie                                        |
| ------------------------------------------------ | -------------------------------------------------- |
| buy 50/current 60/qty 10                         | +20.00%, kwota 100                                 |
| buy 100/current 80/qty 2                         | -20.00%, kwota -40                                 |
| bez zmiany                                       | 0.00%, bez znaku                                   |
| buy 0.00000001/current 0.00000002/qty 0.00000001 | +100.00%, kwota 0.0000000000000001                 |
| 999999999999.99999998 -> 999999999999.99999999   | różnica 0.00000001                                 |
| +/-1.005                                         | +1.01/-1.01                                        |
| dwie kwoty po 0.004                              | suma 0.008, +0.01                                  |
| brak ceny lub daty                               | No price yet                                       |
| brak ilości                                      | procent istnieje, kwota null                       |
| różne daty zakupu/ceny                           | wynik z datą ceny                                  |
| pozycje wykluczone                               | właściwa suma/licznik/najstarsza uwzględniona data |

Pokryć strony progów zaokrąglania, signed zero, comma/dot, grupowanie, granice, 9 miejsc ułamkowych, znaki/wykładniki/mieszane separatory/puste. Zamrozić/przywrócić zegar: dzisiaj, przyszłość, rok przestępny i cena przed zakupem. Zachować paginację 1200/2400, niższy limit i błąd późniejszej strony. Fixture transportu nie dowodzi RLS.

## Performance Considerations

Suma liniowa, bez zaokrąglania składników i bez ograniczania sumy do zakresu pojedynczej kolumny. Zachować paginację/grupowanie.

## Migration Notes

Bez migracji SQL. Odczytywać dokładnie istniejący zapis; historycznie utracone cyfry wymagają porównania ze źródłem i ręcznej korekty. Wdrożyć cały przepływ razem po bramkach.

## References

- [Research](research.md), [Change](change.md).
- PRD: FR-003, FR-006, FR-010–FR-013; test-plan ryzyko #1; verify i lessons.md.
- [PostgREST casting](https://docs.postgrest.org/en/v12/references/api/tables_views.html#casting-columns).
- [Astro Container](https://docs.astro.build/en/reference/container-reference/).

## Progress

### Phase 1: Dokładne operacje i dowód transportu

#### Automated

- [x] 1.1 Testy modułu dziesiętnego przechodzą dla dokładnych działań, ilorazów i zaokrąglania.
- [x] 1.2 `npm run test:decimal-db` potwierdza dokładny transport i izolację testowanych operacji.

### Phase 2: Przełączenie całego przepływu danych

#### Automated

- [x] 2.1 `npm test` potwierdza kontrakty walidacji, obliczeń, formatowania i dotychczasowe regresje.
- [x] 2.2 `npm run test:decimal-db` potwierdza dokładność rzeczywistych usług aplikacji.
- [x] 2.3 Sekwencja `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build` przechodzi.

### Phase 3: Testy renderu wszystkich powierzchni wyniku

#### Automated

- [x] 3.1 Testy renderu potwierdzają literalny wynik i właściwą datę na każdej powierzchni.
- [x] 3.2 `npm test` przechodzi wraz z testami renderu.

#### Manual

- [x] 3.3 Lokalny przegląd potwierdza czytelne wyniki, grupowanie liczb i komunikaty błędnych grup tysięcy.

### Phase 4: CI, dokumentacja i końcowa weryfikacja

#### Automated

- [x] 4.1 Końcowe `npm test` i `npm run test:decimal-db` przechodzą.
- [x] 4.2 Końcowa sekwencja statycznej weryfikacji przechodzi.
- [ ] 4.3 PR do `master` uruchamia istniejący job `ci` i nowy job transportu; oba przechodzą.
