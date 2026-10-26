# Add Sentry — Implementation Plan

## Overview

Zapewnić widoczność nieoczekiwanych awarii aplikacji, również wtedy, gdy kod przechwytuje wyjątek i pokazuje przyjazny komunikat. Raportowanie nie może ujawniać prywatnych danych ani powodować błędów w obsłudze żądania.

## Current State Analysis

Audyt na commicie `273fc74` wykazał:

- Dziewięć bloków `catch` usuwa błędy odczytu bez logowania.
- Middleware pomija wynik błędu `getUser()`, a endpoint wylogowania ignoruje wynik `signOut()`.
- Wspólny logger zapisuje tylko operację, kod i komunikat; opakowania odczytów tracą przyczynę.
- Projekt używa Astro 7, React, Vercel serverless i Node 24. Nie ma SDK trackera.

Lokalne próby potwierdziły reprezentatywne przypadki utraty sygnału. Nie potwierdziły działania monitoringu produkcji.

## Desired End State

Nieoczekiwany błąd serwera, klienta lub obsługiwanej operacji trafia do Sentry z bezpieczną diagnostyką i identyfikacją wdrożenia. Oczekiwane błędy walidacji, brak rekordu i zwykły brak sesji nie tworzą incydentów.

### Key Discoveries

- Zweryfikowana wersja `@sentry/astro` **11.8.0** deklaruje zgodność z Astro 7 i Node 24. [Manifest SDK](https://github.com/getsentry/sentry-javascript/blob/11.8.0/packages/astro/package.json)
- SDK rozdziela konfigurację runtime klienta i serwera od ustawień builda. [Typy integracji](https://github.com/getsentry/sentry-javascript/blob/11.8.0/packages/astro/src/integration/types.ts)
- Integracja dodaje middleware przed middleware aplikacji; nie należy dokładać drugiego wrappera. Aktualne ustawienia source maps używają `sourcemaps`, a nie starszego `sourceMapsUploadOptions`. [Implementacja integracji](https://github.com/getsentry/sentry-javascript/blob/11.8.0/packages/astro/src/integration/index.ts)
- Istniejące testy Astro Container pozwalają sprawdzić rzeczywiste fallbacki stron bez prawdziwej bazy.

## What We're NOT Doing

- Zmian komunikatów, statusów HTTP, przekierowań ani zasad dostępu.
- Migracji bazy, zmian obliczeń finansowych i napraw innych funkcji produktu.
- Replay, profilowania, tracingu, analityki i przechwytywania konsoli.
- Automatycznego wdrożenia produkcyjnego ani zmian ustawień kont bez udziału użytkowniczki.
- Ogłaszania całego audytu „naprawionym”: ta zmiana zamyka luki sygnału, zachowując obecne zachowanie aplikacji.

## Implementation Approach

Jedna integracja SDK obsłuży błędy automatyczne. Wspólny reporter obsłuży błędy przechwycone i wyniki błędów usług. Wspólny filtr końcowego zdarzenia obejmie oba kanały, dzięki czemu automatycznie przechwycony wyjątek również przejdzie ochronę prywatności.

Odczyty raportujemy na granicy fallbacku, zapisy w istniejącej wspólnej ścieżce nieoczekiwanego błędu, a auth przy sprawdzeniu wyniku. Nie raportujemy ponownie tego samego błędu w stronie i serwisie.

## Critical Implementation Details

**Prywatność:** `sendDefaultPii: false` nie zastępuje filtrowania. Komunikaty PostgREST i zagnieżdżone przyczyny mogą zawierać dane. Zachowujemy strukturę diagnostyczną, ale nie wysyłamy surowych obiektów błędów.

**Inicjalizacja:** serwerowa konfiguracja musi wykonać się także przy pierwszym żądaniu do endpointu API. Zapewni to jawny import konfiguracji serwera na wejściu middleware, współdzielący ten sam moduł z integracją SDK.

**Serverless:** nie dodajemy `flush()` do każdego `catch`. Dostarczenie na końcu wywołania Vercel sprawdzamy osobno; lokalny Astro dev nie dowodzi poprawności produkcyjnego cyklu życia.

## Phase 1: SDK i prywatność

### Changes Required

**Pliki:** konfiguracja Astro, manifest i lockfile; nowe konfiguracje `sentry.client.config.ts`, `sentry.server.config.ts`; moduły `src/lib/observability/`.

**Intent:** podłączyć przypięte `@sentry/astro@11.8.0` i utworzyć wspólną ochronę wszystkich zdarzeń.

**Contract:**

- Opcjonalny publiczny DSN przez schemat `astro:env`; bez DSN lokalne uruchomienie i CI nie wysyłają zdarzeń.
- Metadane builda: środowisko z `VERCEL_ENV`, release z `VERCEL_GIT_COMMIT_SHA`; lokalnie `development` i identyfikator lokalnego commita. Wstrzyknięte do obu konfiguracji przez build.
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` są ustawieniami builda. Token nie trafia do runtime ani klienta. Kod aplikacji nie czyta `process.env`.
- Error sampling 100%; tracing, Replay i log collection wyłączone. Nie przekazujemy trace headers do usług zewnętrznych.
- Wspólny `beforeSend` usuwa request, user, breadcrumbs, dowolne extras, surowe komunikaty i wartości przyczyn. Zachowuje bezpieczne typy wyjątków, sparsowane ramki stosu bez lokalnych zmiennych, release, environment oraz dozwolone tagi.
- Komunikaty zdarzeń są stałe i zależne od operacji; kody dostawców pochodzą z allowlisty. URL-e ramek tracą query i fragment.
- Reporter przyjmuje `unknown` oraz kontekst: stała operacja, wzorzec trasy, request ID i opcjonalny UUID encji. Błąd reportera nie propaguje do aplikacji.
- Hidden source maps są przesyłane podczas skonfigurowanego builda. Publiczny artefakt Vercel nie zawiera `.map`. Build bez tokenu nadal działa, ale nie jest dowodem przesłania map.

### Success Criteria

#### Automated Verification

- Testy filtra i reportera potwierdzają zachowanie diagnostyki, usunięcie prywatnych sentinelów oraz odporność na awarię transportu.
- Sekwencja `astro sync → npm run lint → astro check → npm run build` przechodzi z wyłączoną wysyłką.

#### Manual Verification

- Przegląd przykładowego końcowego zdarzenia potwierdza minimalny, bezpieczny payload.

## Phase 2: Znane luki

### Changes Required

**Pliki:** middleware, endpointy auth, serwisy odczytów i zapisów oraz dziewięć granic fallbacku wskazanych w raporcie audytu.

**Intent:** zachować sygnał błędu przed jego zamianą na fallback lub zwykły wynik.

**Contract:**

- Każdy z dziewięciu catchów raportuje przechwycony wyjątek raz, zachowując obecny fallback i wpisane dane formularza.
- Serwisy odczytów zachowują oryginalną przyczynę zamiast samego `message`; nie raportują jej drugi raz.
- Istniejące ścieżki `logUnexpected` korzystają ze wspólnego reportera. Console fallback zawiera wyłącznie tę samą bezpieczną diagnostykę.
- Middleware nadaje losowy request ID i ustawia kontekst wyłącznie w izolowanym zakresie żądania. Wzorzec trasy pochodzi z `routePattern`, nie z pełnego URL.
- Auth sprawdza wyniki `getUser`, signin, signup, wymiany kodu i signout.
- Błędy retry/network, statusy 5xx oraz nierozpoznane błędy auth są raportowane. Klasyfikacja opiera się na typie, kodzie i statusie, nigdy na tekście komunikatu.
- Oczekiwane odmowy nie tworzą incydentów: brak/wygasła sesja, niepoprawne dane logowania, niepotwierdzony e-mail, zajęty e-mail, wyłączona rejestracja, słabe hasło, wygasły flow/OTP, niepoprawny lub brakujący verifier i znane ograniczenia liczby prób.
- Istniejące wyniki walidacji, konfliktu i `not_found` pozostają bez raportowania.

### Success Criteria

#### Automated Verification

- Testy Astro Container obejmują dziewięć granic odczytu: jeden report, właściwa operacja i niezmieniony fallback.
- Testy auth oraz zapisów potwierdzają raportowanie awarii, pomijanie oczekiwanych odmów, brak duplikatów i izolację kontekstu żądań.

#### Manual Verification

- Przegląd lokalnych formularzy i fallbacków potwierdza zachowanie danych oraz dotychczasowego przepływu użytkownika.

## Phase 3: Dowód działania i aktywacja

### Changes Required

**Pliki:** testowy harness lokalnego odbiornika, instrukcja konfiguracji i dotknięte ustawienia CI/builda.

**Intent:** oddzielić dowód działania kodu od dowodu rzeczywistego dostarczenia i powiadomienia.

**Contract:**

- Powtarzalny harness używa lokalnego odbiornika i atrap usług; nie wymaga produkcyjnej bazy ani prawdziwego DSN.
- Próby obejmują: przechwycony odczyt, wynik błędu zapisu, auth 503, nieprzechwycony wyjątek serwera, błąd przeglądarki i odmowę transportu telemetrycznego.
- Testy zdarzeń sprawdzają cały serializowany payload, również przyczyny i metadane automatyczne.
- Użytkowniczka tworzy projekt Astro i ustawia DSN oraz build credentials w odpowiednich zakresach Vercel. Preview i production mają rozróżnialne środowiska.
- Weryfikacja skonfigurowanego wdrożenia obejmuje pierwsze żądanie API, zdarzenie klienta, czytelną lokalizację z source maps i jeden kontrolowany alert e-mail. Tymczasowe triggery nie pozostają w publicznej aplikacji.
- Rollback: cofnięcie zmiany kodu; awaryjne wyłączenie wysyłki przez usunięcie DSN wymaga ponownego builda/wdrożenia. Brak migracji danych.

### Success Criteria

#### Automated Verification

- Lokalny harness potwierdza odbiór bezpiecznych zdarzeń i niezmienione odpowiedzi przy niedostępnym monitoringu.
- Pełne Vitest, wymagana sekwencja statyczna i lokalny smoke auth przechodzą; publiczny artefakt nie zawiera tokenu ani source maps.

#### Manual Verification

- Zdarzenia serwera i przeglądarki docierają do Sentry z właściwym release/environment, czytelnymi ramkami i działającym alertem e-mail.

Po każdej fazie jej ręczne kryterium pozostaje osobnym punktem potwierdzenia. Brak konfiguracji konta nie może być oznaczony jako zaliczona aktywacja.

## Testing Strategy

Testy jednostkowe chronią filtr i klasyfikację błędów. Astro Container sprawdza zachowanie rzeczywistych stron. Testy transportu serwisów podmieniają sieć, zachowując SDK Supabase. Harness sprawdza inicjalizację i finalne zdarzenia; ręczna próba potwierdza dostarczenie z Vercel i alert.

Testy zawierają sentinele w komunikacie, przyczynie, URL, cookies, formularzu i `details`. Żaden sentinel nie może wystąpić w wysłanym payloadzie. Każdy nowy test musi zostać sprawdzony przez kontrolowane naruszenie chronionego zachowania i przywrócenie kodu.

## Performance Considerations

Brak tracingu i Replay ogranicza zbieranie danych. Raportowanie nie blokuje fallbacków i nie wykonuje osobnego oczekiwania na opróżnienie transportu przy każdym błędzie.

## Migration Notes

Brak zmian bazy i publicznych API. Wewnętrznym dodatkiem jest kontrakt reportera oraz bezpieczny kontekst żądania.

## References

- Audyt: `context/audits/observability/2026-10-26_auth-investments-wallets-recoverable-delete.md`.
- Repozytorium: `AGENTS.md`, verify skill i istniejące testy Astro Container.
- Źródła SDK podlinkowane w Key Discoveries.

## Progress

### Phase 1: SDK i prywatność

#### Automated

- [x] 1.1 Testy filtra i reportera potwierdzają zachowanie diagnostyki, usunięcie prywatnych sentinelów oraz odporność na awarię transportu.
- [x] 1.2 Sekwencja `astro sync → npm run lint → astro check → npm run build` przechodzi z wyłączoną wysyłką.

#### Manual

- [x] 1.3 Przegląd przykładowego końcowego zdarzenia potwierdza minimalny, bezpieczny payload.

### Phase 2: Znane luki

#### Automated

- [x] 2.1 Testy Astro Container obejmują dziewięć granic odczytu: jeden report, właściwa operacja i niezmieniony fallback.
- [x] 2.2 Testy auth oraz zapisów potwierdzają raportowanie awarii, pomijanie oczekiwanych odmów, brak duplikatów i izolację kontekstu żądań.

#### Manual

- [x] 2.3 Przegląd lokalnych formularzy i fallbacków potwierdza zachowanie danych oraz dotychczasowego przepływu użytkownika.

### Phase 3: Dowód działania i aktywacja

#### Automated

- [x] 3.1 Lokalny harness potwierdza odbiór bezpiecznych zdarzeń i niezmienione odpowiedzi przy niedostępnym monitoringu.
- [x] 3.2 Pełne Vitest, wymagana sekwencja statyczna i lokalny smoke auth przechodzą; publiczny artefakt nie zawiera tokenu ani source maps.

#### Manual

- [x] 3.3 Zdarzenia serwera i przeglądarki docierają do Sentry z właściwym release/environment, czytelnymi ramkami i działającym alertem e-mail.
