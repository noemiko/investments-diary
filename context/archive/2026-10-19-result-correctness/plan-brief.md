# Result correctness — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Zapewnić poprawny wynik i datę na każdej powierzchni aplikacji. Testy obejmą naprawę utraty cyfr w Number.

## Starting Point

Vitest i CI już działają (27 testów w chwili planowania). Brakuje pełnego pokrycia wyniku; transport i obliczenia nie zachowują całego dopuszczonego zakresu.

## Desired End State

Pełna precyzja od formularza przez bazę do obliczeń. Właściwe zaokrąglenia i daty na pozycjach i portfelach.

## Key Decisions Made

| Decyzja      | Wybór                          | Uzasadnienie               | Źródło   |
| ------------ | ------------------------------ | -------------------------- | -------- |
| Precyzja     | Pełne numeric(20,8)            | Usunąć utratę cyfr         | Plan     |
| Zaokrąglanie | Remisy od zera, zero bez znaku | Symetria                   | Plan     |
| Widoki       | Testy renderu                  | Chronić propsy i daty      | Plan     |
| Stare dane   | Zachować zapis                 | Brak podstaw rekonstrukcji | Plan     |
| Spacje       | Poprawne grupy tysięcy         | Odrzucać 1 2               | Plan     |
| Pozycja      | Nadal procent                  | Wcześniejsza decyzja       | Research |
| Runner       | Zachować Vitest/CI             | Już istnieją               | Research |

## Scope

**In scope:** walidacja, transport, BigInt, formatowanie, render, lokalna baza i CI.

**Out of scope:** rekonstrukcja historii, zmiana formuł/SQL/RLS/tras, browser E2E i pełny audyt RLS.

## Architecture / Approach

Tekst dziesiętny na granicach, PostgREST ::text, BigInt o skali 8/16 i dokładny iloraz procentu. Jedno zaokrąglenie przy wyświetlaniu; bez nowej biblioteki.

## Phases at a Glance

| Faza | Rezultat                      | Ryzyko                  |
| ---- | ----------------------------- | ----------------------- |
| 1    | Dokładne operacje i transport | JSON gubi cyfry         |
| 2    | Przełączenie przepływu        | Pominięty odbiorca      |
| 3    | Testy renderu                 | Błędne propsy           |
| 4    | CI i dokumentacja             | Testy wyłącznie lokalne |

**Prerequisites:** Node projektu, Docker/lokalny Supabase, dostęp do CI na PR.
**Estimated effort:** 4–6 sesji implementacji i weryfikacji.

## Open Risks & Assumptions

- Historycznie utracone cyfry wymagają ręcznej korekty ze źródła.
- Rzeczywisty transport podlega dowodowi wykonawczemu w fazie 1.
- Container API jest eksperymentalne; harness mały i izolowany.

## Success Criteria (Summary)

- Pełna precyzja wejścia, transportu i obliczeń.
- Poprawny wynik i data we wszystkich widokach.
- Jednostki, render, transport i statyczne bramki przechodzą lokalnie i w CI.

## References

[Research](research.md), [pełny plan](plan.md), test-plan ryzyko #1, PRD FR-003/006/010–013.
