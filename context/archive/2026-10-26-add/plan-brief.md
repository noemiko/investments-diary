# Add Sentry — plan i brief

## Brief

Dodamy Sentry dla serwera Astro i przeglądarki oraz raportowanie nieoczekiwanych błędów wskazanych w audycie. Obecne komunikaty, formularze, przekierowania i statusy HTTP pozostaną bez zmian.

| Decyzja     | Ustalenie                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Zakres      | SDK, dziewięć granic odczytu, błędy zapisów i auth                                               |
| Prywatność  | Bez danych formularzy, inwestycji, użytkownika, cookies i parametrów URL                         |
| Funkcje     | Raportowanie błędów; bez Replay, tracingu i automatycznego zbierania logów                       |
| Konto       | Użytkowniczka tworzy projekt Astro, konfiguruje Vercel i alert e-mail                            |
| Weryfikacja | Testy bez zewnętrznej sieci, lokalny odbiornik, następnie sprawdzenie rzeczywistego dostarczenia |

Trzy fazy: bezpieczna integracja SDK → obsługa znanych luk → dowód działania i aktywacja. Implementacja kodu może rozpocząć się bez konta Sentry; aktywacja wymaga konfiguracji konta.
