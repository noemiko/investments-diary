---
type: observability-audit
date: 2026-10-26 19:34
timezone: Europe/Warsaw
mode: audit
commit: 273fc74
branch: chore/archive-completed-changes
dirty_tree: false
areas: [auth, investments, wallets, recoverable-delete]
area_source: user
runtime_proof: partial
error_tracker: "Brak SDK w kodzie; monitoring platformowy niepotwierdzony"
previous_report: null
findings: { critical: 2, high: 3, medium: 1, low: 0 }
---

# Audyt observability — dostęp, inwestycje, portfele i odzyskiwanie

## 1. Najważniejsze ustalenia

- **F1, critical:** dziewięć bloków `catch` usuwa błędy odczytu i dekodowania bez logowania. Widoki pokazują komunikaty błędu, ale zwracają domyślne HTTP 200.
- **F2, critical:** middleware ignoruje `error` z `getUser()`. Awaria dostawcy uwierzytelniania może wyglądać jak brak sesji i kończyć się przekierowaniem do logowania.
- **F3–F4, high:** logowanie, rejestracja, callback i wylogowanie sprowadzają nieoczekiwane błędy do zwykłych przekierowań; wylogowanie nie sprawdza wyniku operacji.
- **F5–F6:** redukcja wyjątków do komunikatu, a błędów bazy do nowego `Error(message)`, usuwa część informacji potrzebnych do diagnozy.
- **Pierwsza poprawka:** wspólne raportowanie nieoczekiwanych błędów w dziewięciu granicach fallbacku, z zachowaniem obecnego UI i prywatności danych. Sama globalna obsługa wyjątków nie zobaczy już przechwyconych błędów.

## 2. Model przechwytywania błędów

### W repozytorium

| Element | Dowód i zakres |
| --- | --- |
| Runtime | Astro SSR (`output: "server"`) z adapterem Vercel: `astro.config.mjs:12,26`. React islands: integracja `astro.config.mjs:14`, np. formularz `src/pages/dashboard/new.astro:110`. |
| Klient danych | Request-scoped Supabase SSR: `src/lib/supabase.ts:13–30`; tworzony również przed rozpoznaniem użytkownika w `src/middleware.ts:6–11`. |
| Granica dostępu | Middleware odczytuje użytkownika i chroni `/dashboard`: `src/middleware.ts:4–20`. Nie raportuje błędów zwróconych przez auth. |
| Tracker | Nie znaleziono SDK ani inicjalizacji trackera w kodzie aplikacji i zależnościach bezpośrednich. Layout nie dodaje klienta telemetrycznego (`src/layouts/Layout.astro:1–22`), konfiguracja zawiera integracje React/sitemap (`astro.config.mjs:14`). To opis dostępnej infrastruktury, nie ustalenie o błędnej konfiguracji produkcji. |
| Logowanie aplikacyjne | Jedno miejsce `console.error`: `src/lib/services/positions.ts:39–41`. Zapisuje nazwę operacji oraz `code` i `message`; używane także przez serwis portfeli (`src/lib/services/wallets.ts:24`). |
| Prywatność | Logger celowo pomija `details`, ponieważ może zawierać zapisany wiersz i treść uzasadnienia (`src/lib/services/positions.ts:38`). Słuszna ochrona danych wymaga bezpiecznej serializacji diagnostyki, a nie wysyłania całego obiektu bez filtra. |
| Scrubbing/sampling/release | Nie znaleziono własnych hooków trackera. Nie można ocenić filtrowania, oznaczania wdrożeń ani map źródeł ustawionych poza repozytorium. |
| Praca w tle | W produkcyjnym `src/` nie znaleziono własnych workerów, cronów ani kodu `waitUntil`/`setImmediate`. Audyt dotyczy żądań SSR, endpointów i wysp React. |

### Założenia poza repozytorium

- Użytkowniczka potwierdziła, że **jeszcze nie sprawdzała monitoringu produkcji**. Nie potwierdza to braku zbierania logów.
- Zakładamy, że platforma zbiera logi i wyniki wywołań. Retencja, forwarding oraz alerty z `console.error` są **niepotwierdzone**.
- Monitoring Supabase może niezależnie pokazać awarię dostawcy; nie odtwarza to utraconego kontekstu operacji w aplikacji.
- Nie stwierdzamy, że zwykłe, nieprzechwycone wyjątki są niewidoczne na Vercel. Ustalenia dotyczą przede wszystkim błędów przechwyconych lub zwróconych jako wartości, które nie docierają do takiej granicy.

## 3. Co zostaje po awarii

Poniższa tabela opisuje analizę statyczną. Wyniki lokalnych prób są w sekcji 8; nie są obserwacją produkcji.

| Kształt awarii | Odpowiedź wynikająca z kodu | Sygnał aplikacyjny | Ocena |
| --- | --- | --- | --- |
| Odczyt pozycji, kategorii, portfeli lub dekodowanie danych rzuca wyjątek | Fallback HTML, domyślne 200 | Brak logu w catch, wyjątek odrzucony | F1 |
| `getUser()` zwraca błąd upstream i `user:null` | Redirect do logowania na chronionej trasie | Pole `error` pominięte | F2 |
| Signin/signup/exchange code zwraca błąd infrastruktury | Redirect z komunikatem, callback mówi o zużytym/wygasłym linku | Brak własnego logu/reportu w endpointach | F3 |
| Globalny signout zwraca błąd unieważniania sesji | Redirect jak po sukcesie | Zwrócony błąd pominięty | F4 |
| Nieoczekiwany błąd zapisu pozycji/ceny/portfela | Formularz 200 z komunikatem | Log operacji, kodu i komunikatu | F5; alertowanie nieznane |
| Błąd delete/restore | Redirect z `delete_failed`/`restore_failed` | Ten sam logger przed redirectem | Nie jest całkowicie niewidoczny; F5 |

## 4. Systemowe przyczyny

1. **Fallback UI zamyka drogę do monitoringu wyjątku.** `src/pages/dashboard.astro:29–33` i osiem analogicznych catchów zachowują dostępność strony, lecz nie zachowują błędu. Mechanizm wyjaśnia F1 dla całego odczytu dziennika.
2. **Zwrócony błąd auth jest traktowany jak zwykły wynik biznesowy.** Middleware pomija `error` (`src/middleware.ts:9–16`), endpointy auth nie rozróżniają awarii od oczekiwanej odmowy (`src/pages/api/auth/signin.ts:10–13`, `src/pages/auth/callback.ts:18–20`), a signout w ogóle nie sprawdza wyniku (`src/pages/api/auth/signout.ts:6`). To wspólna przyczyna F2–F4.
3. **Redukcja obiektów błędu usuwa diagnostykę przed jej zapisaniem.** Logger przyjmuje tylko kod i komunikat (`src/lib/services/positions.ts:39–41`), catch kategorii tworzy obiekt message-only (`:243–245`), a odczyty opakowują błędy bez przyczyny (`src/lib/services/read-all.ts:12`). Wyjaśnia F5–F6.

## 5. Ustalenia

### Odczyt dziennika, porównanie, portfele i odzyskiwanie

| ID | Lokalizacja | Kategoria | Severity | Skutek w produkcji | Kierunek poprawki |
| --- | --- | --- | --- | --- | --- |
| F1 | `src/pages/dashboard.astro:31`; `src/pages/dashboard/new.astro:73,80,93`; `src/pages/dashboard/positions/[id].astro:44`; `src/pages/dashboard/wallets/index.astro:24`; `src/pages/dashboard/wallets/[id].astro:45,80`; `src/pages/dashboard/deleted.astro:15` | swallowed | critical | Błąd bazy lub dekodera staje się komunikatem w stronie 200. Użytkownik nie widzi pozycji, wartości portfeli lub kosza; porównanie może przestać działać przy nadal dostępnym zapisie. Oryginalny błąd nie zostaje w logu aplikacji, a status nie wskazuje awarii. | Związać wyjątek w catch i raportować raz przed fallbackiem z operacją i bezpiecznym kontekstem; świadomie określić status odpowiedzi. |

### Logowanie i sesja

| ID | Lokalizacja | Kategoria | Severity | Skutek w produkcji | Kierunek poprawki |
| --- | --- | --- | --- | --- | --- |
| F2 | `src/middleware.ts:9–16` | missing-throw | critical | Supabase `/user` 5xx może dać `{user:null,error}`; middleware traktuje użytkownika jak anonimowego i przekierowuje do signin. Awaria dostępu do całego dziennika wygląda jak wygaśnięcie sesji, bez zachowania błędu przez aplikację. | Odróżniać oczekiwany brak sesji od awarii upstream; raportować kod/status i operację oraz pokazać stan niedostępności. |
| F3 | `src/pages/api/auth/signin.ts:10–13`; `src/pages/api/auth/signup.ts:10–18`; `src/pages/auth/callback.ts:18–20` | flattened-response | high | Awaria auth kończy się redirectem. Signin/signup przekazują tylko komunikat do UI; callback podaje błędną diagnozę o zużytym/wygasłym linku również przy awarii usługi. Brak raportu z typem, kodem i statusem. | Wspólna klasyfikacja auth: oczekiwane błędy danych/tokenów pozostają zwykłym UX, awarie infrastruktury otrzymują osobny sygnał i odpowiedni komunikat. |
| F4 | `src/pages/api/auth/signout.ts:6–7` | missing-throw | high | Zwrócony błąd globalnego wylogowania jest ignorowany. SDK usuwa lokalną sesję przy części błędów zdalnej operacji, lecz nieudane unieważnienie innych sesji pozostaje bez śladu w endpointcie. Redirect sugeruje zakończenie operacji. | Sprawdzać wynik; raportować nieoczekiwany błąd unieważniania i odpowiednio zakomunikować zakres powodzenia operacji. |

Brak sesji, błędne hasło, wygasły token i prawidłowe ukrycie cudzych rekordów przez RLS **nie są ustaleniami audytu**.

### Wspólna diagnostyka serwisów

| ID | Lokalizacja | Kategoria | Severity | Skutek w produkcji | Kierunek poprawki |
| --- | --- | --- | --- | --- | --- |
| F5 | `src/lib/services/positions.ts:39–41,243–245`; wywołania `:49,139,168,249`; `src/lib/services/wallets.ts:24` | identity-lost | high | Nieoczekiwane błędy zapisów zachowują log, ale catch kategorii usuwa typ i stack prawdziwego wyjątku, a logger pomija przyczynę. Błędy transportu mogą mieć diagnostykę w `details`, która jest celowo pomijana. Formularze zwracają 200, delete/restore redirect; responder zależy od ograniczonego logu. | Wspólny reporter zachowujący stack/cause prawdziwych wyjątków i bezpieczne pola błędów usług; dodać request/operation/entity ID. Nie wysyłać całego `details`, treści reason, haseł ani formularzy. |
| F6 | `src/lib/services/positions.ts:60,100,119,154`; `src/lib/services/wallets.ts:35,50`; `src/lib/services/read-all.ts:12` | identity-lost | medium | Siedem miejsc zastępuje błąd bazy przez `new Error(message)` bez `cause` i kodu. Dziś te wyjątki są dalej usuwane w F1; samo dodanie raportowania w catch nie odzyska już ich struktury. | Zachować oryginalną przyczynę oraz bezpieczny kod/status w błędzie serwisowym; filtrować payload na granicy raportowania. |

F5 nie oznacza, że logi nigdy nie generują alertów — tego nie sprawdzano. F6 jest odrębnym krokiem naprawy wierności diagnostycznej, nie kolejnym przypadkiem niewidocznej awarii.

## 6. Kolejność napraw

1. **F1:** reporter w dziewięciu granicach fallbacku. Jeden kontrakt: operacja, bezpieczna przyczyna, identyfikator żądania i opcjonalny identyfikator encji. Nie raportować drugi raz tego samego zdarzenia w serwisie i widoku.
2. **F2–F4:** klasyfikacja błędów auth oraz kontrola wyników `getUser()` i `signOut()`. Oczekiwanego braku sesji nie eskalować do awarii.
3. **F5–F6:** wspólna bezpieczna serializacja, zachowanie przyczyny w serwisach i identyfikatorów kontekstu. Chronić treść uzasadnień i dane logowania; nie przekazywać całych błędów PostgREST bez filtrowania.
4. Dopiero potem dobrać lub potwierdzić kanał dostarczenia tych sygnałów do człowieka. Ustawienia dashboardów nie są przyczyną opisanych tu mechanizmów w kodzie.

## 7. Metoda i ograniczenia

- Pierwszy raport w `context/audits/observability/`; brak poprzedniego raportu do porównania.
- Audyt równoległy: auth; inwestycje/porównanie/cena; portfele/delete/restore wraz ze wspólnym plumbingiem. Główny audytor niezależnie sprawdził wszystkie dziewięć catchów, middleware, trzy endpointy auth, callback, logger i opakowania błędów.
- Lokalnie sprawdzono źródła zainstalowanego SDK: `node_modules/@supabase/auth-js/src/lib/fetch.ts:74–97` zamienia błędy infrastruktury na błędy auth; `GoTrueClient.ts:3245–3285` zwraca je jako wynik `getUser`; `:4080–4118` zwraca błędy zdalnego signout i obsługuje usunięcie lokalnej sesji. To dowód z kodu zależności, nie obserwacja produkcji.
- `node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:293–325` zachowuje diagnostykę części błędów sieci w `details`; jej bezwarunkowe wysłanie mogłoby ujawnić dane, więc potrzebna jest selektywna serializacja.
- Sweep objął **65 plików `src/` bez `.test.`**: 10 catchów (9 bez bindingu), 1 miejsce `console.error`, 14 miejsc `new Error`, 0 opcji `cause:`, 6 wywołań `logUnexpected` (7 dopasowań z definicją), 0 `captureException`/`captureMessage`, 0 dopasowań `unhandledrejection`, `uncaughtException`, `waitUntil`, `setImmediate`, `addEventListener`.
- Nie zgłoszono osobno każdej trasy ani braku SDK jako przyczyny. Nie sklasyfikowano też wszystkich ograniczeń bazy jako bugów: naruszenia walidacji mogą być oczekiwane i wymagają odrębnego dowodu regresji.
- Drzewo było czyste przy rozpoczęciu audytu; jedynym docelowym plikiem tworzonym przez audyt jest ten raport. Nie zmieniano kodu aplikacji ani konfiguracji. Pełna sekwencja testów/build nie jest walidacją raportu i nie została uruchomiona w głównym checkoutcie.

## 8. Lokalne próby runtime

Próby wykonano po zgodzie użytkowniczki w **`/private/tmp/investments-observability-FIGzvR`**, na lokalnym Astro dev, port 4387. Brak lokalnego executable Vercel; wynik `partial` oznacza potwierdzenie mechanizmu aplikacji, nie zgodności logowania z produkcyjnym runtime Vercel. Sandbox początkowo odrzucił nasłuch (`EPERM`); po zatwierdzeniu rozszerzenia uprawnień próby ruszyły.

| Próba | Zaobserwowana odpowiedź | Zaobserwowane logi lokalne | Wniosek |
| --- | --- | --- | --- |
| P-read: natywna `/dashboard/deleted`, stub zapytania zwraca `XXPROBE` | **200**, widoczny komunikat „Your deleted positions could not be loaded” | Access log 200; brak `probe-database-down` i wyjątku | Potwierdza reprezentatywne miejsce F1. Pozostałe osiem catchów sprawdzono statycznie. |
| P-auth: natywne middleware i zainstalowany Supabase SDK, wstrzyknięty fetch zwraca HTTP 503 | **302**, `Location: /auth/signin` | Tylko access log 302; brak błędu upstream | Potwierdza F2. Użyto placeholder Authorization, aby SDK wykonało ścieżkę pobierania użytkownika; fetch jest atrapą w pamięci. |
| P-logger: prawdziwy `logUnexpected`, sztuczny Error z cause i kodem | Syntetyczny endpoint kontrolny zwraca 500 | `probeWrite failed { code: 'XXPROBE', message: 'probe-write-cause' }`; brak stack i cause | Potwierdza redukcję diagnostyki w F5; status kontrolnego endpointu nie opisuje statusu rzeczywistego formularza zapisu. |
| P-handler: wyjątek w syntetycznym handlerze | **500** | `probe-handler-control` ze stack trace | Kontrola: lokalny framework potrafi zarejestrować nieprzechwycony wyjątek. |
| P-return: syntetyczny handler zwraca 500 bez throw | **500** | Access log 500, brak wyjątku | Sam status nie daje diagnostyki przyczyny. |
| P-early: syntetyczny throw przed klientem w middleware | **500** | `probe-early-middleware` ze stack trace | Kontrola granicy middleware, wyłącznie w Astro dev. |

Nie zainstalowano trackera specjalnie do próby. Zgodnie z procedurą dla aplikacji bez SDK pominięto fake ingest; **nie ma wyniku „tracker odebrał/nie odebrał”**, tylko odpowiedzi i lokalne logi. Nie uruchamiano prób background/unhandled rejection/stream/browser: brak własnych odpowiadających im przepływów w zakresie lub wymagałyby dodatkowej, niepotwierdzającej ustaleń infrastruktury.

### Harness i odtworzenie

- `suite.mjs` uruchamia serwer, wywołuje katalog prób i zapisuje `probe-results.json` oraz `probe-server.log` w powyższej kopii.
- W kopii zmieniono `src/lib/supabase.ts` (stub klienta; rzeczywisty SDK z atrapą fetch dla auth), `src/middleware.ts` (trigger wczesnego wyjątku), dodano `src/pages/probe.ts` (kontrole) i `suite.mjs`. Skopiowano śledzone pliki i użyto symlinku do istniejących `node_modules`; nie kopiowano produkcyjnych sekretów.
- Odtworzenie: przejść do `/private/tmp/investments-observability-FIGzvR`, uruchomić `installation/bin/node suite.mjs`. Wymaga zgody na lokalny nasłuch, jeśli sandbox go blokuje.
- Nie wykonywano zapytań aplikacji do produkcyjnej bazy ani kont zewnętrznych. Pierwszy start Astro wyświetlił informację o dostępnej aktualizacji; możliwe sprawdzenie aktualizacji przez narzędzie nie było ruchem biznesowym aplikacji ani wysyłką danych sondy.
- Zachowano kopię i artefakty do przyszłego before/after. Testy lokalne nie potwierdzają retencji, alertów, map źródeł ani zachowania produkcyjnego Vercel.
- Kontrola sprzątania przez `astro dev stop` w katalogu kopii zwróciła `No dev server is running.`
