# Evidence: rules guarded in the code

Scope: whole repo per `0-sources.md` (head b111cc7). Layers searched: all 19 files in `supabase/migrations/` (read in full), `supabase/rollbacks/`, `supabase/config.toml` (auth/api sections), `src/middleware.ts`, `src/pages/**` (API routes and `.astro` frontmatter POST handlers), `src/lib/services/*`, `src/lib/validation/*`, `src/lib/*.ts`, `src/lib/market-data/*`, domain components under `src/components/{positions,market-prices,wallets,auth}`, `scripts/accounts/*`, `scripts/automation/configure-wallet-cron.mjs`, `scripts/demo/*`, and `src/lib/observability/{privacy,config}.ts` only for the privacy rule.
Patterns: `check (`, `raise exception`, `create policy`, `grant`/`revoke`, `trigger`, `security definer`, `cron.schedule`; in TS `.insert(`/`.update(`/`.delete(`/`.upsert(`/`.rpc(`, `.refine(`, `superRefine`, `origin`/`sec-fetch`, `disabled`, `preventDefault`.
Not covered: tests (`*.test.ts`, `tests/`, `scripts/testing/**`) except to locate one file path; the operator SQL `context/deployment/automatic-stock-prices-manual-selection.sql` referenced by `scripts/testing/database/test-market-price-recovery.mjs:14` (under `context/`, out of bounds for this brief); hosted Supabase/Vercel settings (no code in repo).
Note: the harness auto-injected `CLAUDE.md` and `context/foundation/prd.md` into this agent's context. They were not used as a source; every row below cites code only.

Strictness labels per the brief: hard (data) / hard (app) / soft / client-only. "Rule" text is my paraphrase (inference); quotes are code wording.

## Guarded rules

### Ownership and privacy (every table)

| rule (inference) | guarded at | paths covered | strictness | failure handling |
|---|---|---|---|---|
| An account sees and writes only its own categories and positions | DB: `supabase/migrations/20260929141102_create_diary_core.sql:47-66` (`using (auth.uid() = user_id)` for select/insert/update); "anon gets no policy at all" `:69` | all reads/writes via request client (`src/lib/services/positions.ts:23` "Always the request-scoped client, so RLS scopes every query") | hard (data) | zero rows → `not_found` (`positions.ts:156-157`, `185`) |
| Same for wallets | `20261019112848_create_wallets.sql:28-37` | same | hard (data) | same (`wallets.ts:110-111`) |
| Same for quote cache, lookups, targets, selection receipts, snapshots | `20261030110418_market_price_persistence.sql:71-82`; `20261030114323_listing_lookup_receipts.sql:18-28`; `20261030162000_pending_stock_selections.sql:32-47`; `20261028160000_wallet_snapshots.sql:23-28` | same | hard (data) | — |
| A position may only reference its owner's category and wallet | composite FKs `20260929141102_create_diary_core.sql:40-41` "a position can only use its owner's category"; `20261019112848_create_wallets.sql:57-59` `positions_wallet_fkey`; listing/target/receipt FKs `20261030110418…:103-104`, `20261030162000…:52-55` | every insert/update | hard (data) | FK 23503 → `wallet_not_found`/`category_not_found` (`positions.ts:53-56`) |
| The effective-price view applies the caller's RLS | `20261030110418…:210` `with (security_invoker=true)`; re-created with same option `20261030162000…:150`, `20261030162500…:7` | all list/detail/confrontation/wallet reads (`positions.ts:77,102,124`, `wallets.ts:69`) | hard (data) | — |
| Table privileges for authenticated are exactly select/insert/update, no delete, nothing for anon | `20261102150000_grant_core_table_access.sql:7-9` | — | hard (data) | — |
| Dashboard pages require a signed-in user | middleware `src/middleware.ts:7` `PROTECTED_ROUTES = ["/dashboard"]`, `:22-25` redirect; repeated per handler: `new.astro:33-36`, `positions/[id].astro:26-29`, `wallets/new.astro:15-18`, `wallets/[id].astro:25-28`, `positions/[id]/delete.ts:8-10`, `restore.ts:8-10`, `move.ts:15`, `lib/market-data/endpoint.ts:39`, `new-search-endpoint.ts:19` | all `/dashboard/**` routes | hard (app); data layer is independently hard via RLS | redirect / 401 JSON |
| Foreign, missing and deleted ids are indistinguishable to the caller | `positions.ts:116-120` "Missing, foreign (hidden by RLS) and deleted ids all give null"; `positions/[id].astro:44-45`; `wallets.ts:48-50` | detail pages, delete/restore/move | hard (app) | 404 / rewrite to not-found |
| Diary content is not sent to error tracking | `src/lib/observability/config.ts:9` `sendDefaultPii: false`, `:16` `beforeSend: scrubEvent`; `privacy.ts:136-139` "Rebuild rather than redact", message replaced by `Unexpected application failure: ${tags.operation}` | all Sentry events | hard (app) | — |
| Form errors on new investment are re-rendered, not put in the URL | `new.astro:30-31` "redirecting with `?error=` would put the submitted values, reason text included, into the URL" | new investment only | hard (app) | — |

### Accounts

| rule | guarded at | paths covered | strictness | failure handling |
|---|---|---|---|---|
| No public sign-up | `supabase/config.toml:169` `enable_signup = false`; `:171` `enable_anonymous_sign_ins = false`; app has only `src/pages/api/auth/signin.ts` and `signout.ts` (no sign-up route; grep `signUp` in `src/` → none) | local Auth; hosted Auth setting **unknown** (not in repo) | hard (data) locally | Auth returns `signup_disabled` (listed in `src/lib/observability/auth.ts:11`) |
| Accounts are created by the owner, confirmed, password ≥ 12 chars, unique email | `scripts/accounts/create-user.sql:27-35` (`raise exception 'Password must be at least 12 characters; nothing changed'`, `'An account with this email already exists; nothing changed'`), `email_confirmed_at … now()` `:43`; production requires interactive TTY and typed project ref `create-user.sh:151,158` | owner script only | hard (app) for this script; Auth's own minimum is `minimum_password_length = 6` (`config.toml:175`) | named error, transaction rolled back (`create-user.sql:12,59`) |

### Positions: recording

| rule | guarded at | paths covered | strictness | failure handling |
|---|---|---|---|---|
| Buy price > 0, quantity > 0 if given; numeric(20,8) | DB `20260929141102…:32,34`; app `validation/position.ts:23-46` (`POSITIVE_MESSAGE = "Must be greater than 0"`), `validation/decimal.ts:5-10` (≤12 integer, ≤8 fraction digits, non-negative); client `PositionForm.tsx:198-199` | create | hard (data) | named field error; DB 23514 → `validation` (`positions.ts:46,57`) |
| Buy date not in the future (UTC) | app only `validation/position.ts:63-68` "The buy date cannot be in the future"; client `PositionForm.tsx:201-202`; DB deliberately has no check `20260929141102…:6-8` | create (only writer) | hard (app) — DB accepts a future date from a direct API insert | named field error |
| Every position has a category (existing or newly typed, exactly one) | DB `category_id uuid not null` `20260929141102…:36`; app `validation/position.ts:88-103` "Choose an existing category or type a new one, not both" / "Choose a category"; client `PositionForm.tsx:207-212` | create | hard (data) | named field error |
| Category names unique per user (case-insensitive) among non-deleted | `20260929141102…:23-25` unique index on `lower(name)` where `deleted_at is null`; app reuses existing on match `positions.ts:211-241` | create (new category path) | hard (data) | race → re-select (`positions.ts:234-238`) |
| Every position belongs to one wallet of its owner | `20261019112848…:54` `wallet_id set not null`, FK `:57-59`; app wallet re-read `market-selections.ts:45-53` | create | hard (data) | `wallet_not_found` |
| Every position has a server-validated stock selection (receipt bound to owner + wallet, unexpired) | DB trigger `guard_position_selection` latest body `20261102080240…:12-27` ("Choose a valid stock selection for this wallet", "Stock selection requires a valid receipt"); `market_target_id set not null` `20261102120000…:50`; app `readMarketSelection` `market-selections.ts:38-65`; page derives label from selection "never the posted instrument" `new.astro:108-113` | create | hard (data) | named error `selection_invalid` (`positions.ts:259`; copy `new.astro:41-43`) |
| The instrument label is the selected symbol, not user text | trigger overwrites `NEW.instrument:=target.symbol` `20261102080240…:22`; app `positions.ts:283` | create | hard (data) | silently corrects (a posted instrument is replaced) — by design |
| Receipts expire after 30 minutes | `20261030162000…:27` `valid_until … +interval '30 minutes'`; checked in trigger `20261102080240…:15` and app `market-selections.ts:60` | create | hard (data) | `selection_invalid` |
| A saved stock selection is immutable | trigger `20261102080240…:7-11` "Saved stock selection is immutable"; retired endpoints `lib/market-data/endpoint.ts:43-44` → 409 `selection_already_set`; RPCs `claim/finish/confirm_listing_lookup` EXECUTE revoked `20261102130000…:10-13`; `revoke update(market_listing_id,listing_confirmed_at)` `20261102140000…:6` | all update paths | hard (data) | named error / 409 |
| Reason text ≤ 10,000 chars, optional | DB `20260929141102…:37`; app `validation/position.ts:84`; client `PositionForm.tsx:214` | create | hard (data) | field error |
| Search query 2–100 chars, wallet must be the user's non-deleted wallet | `market-selections.ts:75-85`; `new-search-endpoint.ts:8` | search | hard (app) | `invalid_request` / `not_found` |
| Search returns only Yahoo EQUITY/ETF, max 10 | `market-data/yahoo.ts:181,186` (`quoteType !== "EQUITY" && … "ETF"` → null), `:281`; DB `instrument_type in ('EQUITY','ETF')` `20261030162000…:10` | search | hard (data) for type | dropped silently from results |
| (absence) Restriction to US/Polish listings | no exchange/region allowlist found in `yahoo.ts` (`candidate` `:178-194` only checks exchange code shape); currency allowlist USD/PLN/EUR applies at quote time `:212` | — | **not guarded** (inference: EUR listings on any exchange pass) | — |

### Positions: price, close, delete/restore, move

| rule | guarded at | paths covered | strictness | failure handling |
|---|---|---|---|---|
| Manual current price > 0 and comes with its date; date ≥ buy date | DB `20261015094649…:13,17-20` (`positions_price_pair_check`, `positions_price_date_check`); app `validation/price.ts:13-20` | price update | hard (data) | named field error |
| Price date not in the future | app only `validation/price.ts:19`; DB deliberately not `20261015094649…:7-9` | price update | hard (app) | field error |
| Only open, non-deleted positions get a manual price | app `positions.ts:146-149` (`.is("sell_price", null)`), page `positions/[id].astro:69-70` "This position is already closed…"; form shown only when open `[id].astro:203` | app path | **soft**: column grant includes `current_price,price_date` `20261030122155…:60-62`; a direct PATCH on a closed row passes all checks | `not_found` |
| Manual-price save time is stamped by the DB, not the client | `guard_manual_save_time` `20261030110418…:129-138` "Manual save time is database stamped"; `stamp_manual_price_save` `:139-147` | every update | hard (data) | named error |
| Sale is a complete pair, price ≥ 0, sell date ≥ buy date | DB `20261028120000_close_position.sql:5-7`; app `validation/close-position.ts:29-43` | close | hard (data) | field error |
| Sell date not in future; explicit "entire position" acknowledgement | app `close-position.ts:42` and `:44` `z.literal("on", { error: "Confirm that you are closing the entire position" })` | close | hard (app) / acknowledgement is app-only | field error |
| A position closes once; no reopening or sale correction | app `positions.ts:312-314` (filters `sell_price`/`sell_date` null); `[id].astro:69-70` "Sale corrections and reopening are not available yet." | app path | **soft**: `sell_price, sell_date` are in the update grant `20261030122155…:61`; only the pair check `20261028120000…:5` constrains — a direct PATCH setting both to null reopens, or rewrites the sale | `not_found` |
| No hard delete; deletion is soft and restorable | no delete policy `20260929141102…:68`; no DELETE grant `20261102150000…:5,7-9`; services `positions.ts:190-209` | delete/restore | hard (data) for no hard delete | `not_found` / `?error=delete_failed` |
| Delete requires a confirmation click | `DeletePositionControl.astro:13-15,28-32` (`<details>` then POST form) | UI | client-only (endpoint `delete.ts` acts on any POST) | — |
| Wallet reassignment only between the owner's non-deleted wallets with equal currency, position not deleted; open or closed allowed | RPC `move_position_to_wallet` final body `20261030140619…:31-52` (`'incompatible_currency'`, `'not_found'`); `wallet_id` excluded from the update grant `20261030122155…:59-62` "no direct PATCH may bypass its checks"; client filters choices `MovePositionControl.tsx:23` | move | hard (data) | named result → 409/404 (`move.ts:40-43`) |
| Deleted positions excluded from lists, detail, confrontation, wallet totals | `.is("deleted_at", null)` `positions.ts:81,106,128`, `wallets.ts:73`; capture `20261030122155…:29` | reads | hard (app) — RLS alone shows deleted rows (`positions.ts:118-119` "RLS checks only ownership, hence the explicit `deleted_at` filter") | — |
| Confrontation shows only same-category, own, non-deleted positions | `lib/confrontation.ts:29-39`; data `positions.ts:99-114` | new-investment form | hard (app) over RLS | read failure → `unavailable` panel, save still allowed (`new.astro:178-186`) |

### Wallets

| rule | guarded at | paths covered | strictness | failure handling |
|---|---|---|---|---|
| Name 1–60 chars trimmed, unique per user case-insensitive | DB `20261019112848…:15-16,24-26`; app `validation/wallet.ts:29` | create/update | hard (data) | `name_taken` (`wallets.ts:27`) |
| Starting value ≥ 0 (0 allowed) | DB `20261019112848…:17`; app `validation/wallet.ts:13-26` | create/update | hard (data) | field error |
| Wallets cannot be deleted (not even soft) | `20261019150000_prevent_wallet_deletion.sql:3-4` `wallets_no_soft_delete check (deleted_at is null)`; no delete policy/grant | all | hard (data) | 23514 → `validation` |
| Currency is USD, PLN or EUR, required | `20261030110418…:4`; `20261030140619…:7-9` default 'USD', not null; app `validation/wallet.ts:31` | create | hard (data) | field error. Note: DB default `'USD'` would silently fill an omitted currency on a direct insert |
| Wallet currency is frozen after creation | trigger `20261030140619…:13-22` "Wallet currency cannot be changed"; app `validation/wallet.ts:51-53`; UI shows fixed text `WalletForm.astro:65-67` | update | hard (data) | named error |
| A linked listing's currency must equal the wallet currency | trigger `guard_position_listing` `20261030110418…:109-127` "Listing currency must match the confirmed wallet currency"; `finish_market_target` links only `w.currency=q.currency` `20261030162000…:120-125`, counts mismatches `:126-130` | link on download | hard (data) | mismatches left unlinked, reported as `incompatible_currency` (`market-prices.ts:241-242`) |

### Wallet observations (snapshots)

| rule | guarded at | paths covered | strictness | failure handling |
|---|---|---|---|---|
| Observations are immutable and only the scheduled capture writes them | `20261028160000…:26-28` "No client write policies. Cron is the only ordinary capture writer."; `revoke insert, update, delete … from anon, authenticated`; function executable by `service_role` only `:61-62`, re-stated `20261030122155…:53-54` | all | hard (data) | — |
| One observation per wallet per UTC day; first one wins | PK `(wallet_id, observation_day)` `20261028160000…:15`; `on conflict … do nothing` `20261030122155…:50`; `check (observation_day = (captured_at at time zone 'UTC')::date)` `20261028160000…:17` | capture | hard (data) | duplicate silently skipped (by design) |
| Value = starting + realised + open; counts consistent | `20261028160000…:18-20`; `snapshots_source_coverage` `20261030122155…:8-13` | capture | hard (data) | — |
| Capture uses cached effective prices; no provider call | `capture_wallet_snapshots` reads `position_effective_prices` `20261030122155…:29` | capture | hard (data) | — |
| Old observations inherit wallet currency without changing amounts | data migration `20261030140619…:25-27` | one-off | — | — |

### Market prices (Download prices)

| rule | guarded at | paths covered | strictness | failure handling |
|---|---|---|---|---|
| Provider is called only from an authenticated same-origin JSON POST | `lib/market-data/endpoint.ts:37-46` (405 non-POST, 401, 403 on origin/`sec-fetch-site`, 400 non-JSON); body ≤ 4096 `:50`; ≤ 50 position ids `:7` | download, new search | hard (app) | JSON reason + status |
| One refresh per listing at a time; 15-minute (or provider) cooldown after failure | `claim_market_quote_refresh` `20261030110418…:149-163` (30-s lease, cooldown check); `finish_market_quote_refresh` `:198-202` `greatest(…+interval '15 minutes', in_retry_after)`; same for targets `20261030162000…:89-139` | download | hard (data) | `cooldown`/`refreshing` → 429 (`endpoint.ts:29`) |
| Accepted quote: 0 < price < 1e12, market time ≤ fetch time ≤ now, market date matches exchange timezone | `20261030110418…:180-186` "Invalid regular-session quote"; app pre-check `yahoo.ts:209-220` | download | hard (data) | `invalid_quote` |
| An older quote never replaces a newer one | `20261030110418…:187-191` (`older_quote`, sets cooldown) | download | hard (data) | outcome `older_quote` |
| Failure keeps the last valid quote | `20261030110418…:199-202` "Preserve every last-valid quote field on failure" | download | hard (data) | — |
| Listing identity in cache is immutable; timezone valid | `guard_quote_identity` `20261030110418…:84-97` "Confirmed listing identity is immutable" | cache writes | hard (data) | named error |
| Clients can insert only identity columns into cache/targets; price fields only via owner-checked RPCs | `20261030110418…:79-82`; `20261030162000…:43-47` | — | hard (data) | — |
| Only open, non-deleted holdings are downloaded/linked | app `market-price-repository.ts:101-105`, `market-target-repository.ts:56-60`; DB `claim_market_target` `20261030162000…:97-99`, `finish_market_target` `:120-125` | download | hard (data) | — |
| Price selection: sale > newer manual override > automatic > manual > missing | view `20261030110418…:217-241` (manual wins while `q.market_at <= p.manual_price_saved_at`) | all reads, capture | hard (data) (single definition) | — |
| Provider request budget 5 s per click, batch ≤ 50 | `yahoo.ts:17-18`; `refresh-policy.ts:26-49` | download | hard (app) | unfinished items reported `due`, leases released (`market-prices.ts:114-119`) |

## Soft and client-only rules

- **Reason text lock — not guarded anywhere.** `20260929141102…:4-5` "Reason lock (FR-008): enforced in S-07. This migration adds no trigger for it"; `20261030122155…:58` "Reason locking remains in the existing application write policy" — but no such policy exists: the column grant includes `reason_text` (`20261030122155…:60-61`), no trigger references it (grep of migrations), and the app has no update path for it (grep `reason_text` in `src/` → only create/read). Evidence: any signed-in client can PATCH `reason_text` at any time via PostgREST. Strictness: none (app simply lacks an edit feature).
- **Editing factual fields (buy price/date, quantity, broker, category)** — no app writer exists (grep of `.update(` in `src/`: only price, delete/restore, close, wallet). The DB grant allows it (`20261030122155…:60-62`), guarded only by the CHECKs above; future buy date accepted.
- **Closed-position immutability / no reopen** — soft, bypass: direct PATCH `sell_price=null, sell_date=null` (grant `20261030122155…:61`, pair check `20261028120000…:5` satisfied).
- **Manual price only on open positions** — soft, bypass: direct PATCH of `current_price, price_date` on a closed row.
- **Future buy/price/sell dates** — hard (app) only; DB comments explain why (`20260929141102…:6-8`, `20261015094649…:7-9`).
- **Soft-delete timestamp** is client-supplied (`positions.ts:193` `new Date().toISOString()`); `deleted_at` is in the update grant, so a client can set any value or restore directly.
- **Reason categories**: no app rename/delete path; update grant + policy (`20261102150000…:8`, `20260929141102…:56-57`) let a direct client rename or set `deleted_at` on a category. No check prevents deleting a category still used by positions (soft delete keeps FK valid).
- **Delete confirmation** — client-only (`DeletePositionControl.astro`).
- **CSRF/origin check is inconsistent** — present on `new.astro:74-80`, `move.ts:16-20`, `endpoint.ts:40-42`, `new-search-endpoint.ts:20-22`; absent on form POSTs in `positions/[id].astro` (price/close), `positions/[id]/delete.ts`, `restore.ts`, `wallets/new.astro`, `wallets/[id].astro`, `api/auth/signout.ts`. Inference: protection there rests on cookie SameSite defaults of `@supabase/ssr` (not verified in this repo).
- **Selection receipts are not consumed** — a receipt can be reused for several positions until `valid_until` (no "used" flag in `20261030162000…:22-31`; trigger only checks validity). Inference, low impact.

## Writers that work against a guard

- `20261102120000_require_position_stock_selection.sql:30-48` — `alter table public.positions disable trigger positions_guard_selection;` to backfill every position without a selection (open, closed, deleted, any currency) to Apple `('yahoo','AAPL','NMS','EQUITY')` `:24-28,41-46`, then re-enables. Comment: "bypass it only for this backfill … no permanent bypass exists". The backfill rewrites `market_target_id` but not the `instrument` label (`:5-6` "Nothing here writes instrument labels").
- `20261030140619_set_wallet_denominations.sql:6` — `update public.wallets set currency='USD' where currency is null;` (assigns a denomination to every legacy wallet) and `:25-26` writes `currency` into existing snapshots, the only write to snapshots outside capture.
- `20261019112848_create_wallets.sql:44-52` — backfill creates a 'Main' wallet with starting value 0 per author and moves all their positions (deleted included) into it.
- `20261030122155…:59` — `revoke update on public.positions` then column re-grant: at this point `manual_price_saved_at`, `listing_confirmed_at`, `user_id`, `created_at` are granted (guarded by triggers/RLS respectively); `market_listing_id, listing_confirmed_at` revoked later `20261102140000…:6`.
- `scripts/demo/lib/demo-data.mjs` (service-role, local only — `assertLocal` `:21-22` "Demo seeding requires local Supabase"): hard-deletes positions, wallets, categories, snapshots, receipts and cache rows on `--reset` (`:239-252`); fabricates `wallet_snapshots` via upsert (`:319-324`), the only non-cron snapshot writer; sets `market_listing_id` directly (`:303-313`). Refuses unmarked accounts `:190-191`.
- `supabase/rollbacks/*.down.sql` — destructive drops ("WARNING: this DESTROYS every diary row"), kept outside `migrations/` so the CLI never applies them (`20260929141102_create_diary_core.down.sql:3-5`).
- Unknown: `context/deployment/automatic-stock-prices-manual-selection.sql` (operator recovery SQL, exercised by CI `test-market-price-recovery.mjs:13-15`) — not read per brief; likely a writer against the selection/price guards.

## Failure handling

- Named/mapped errors dominate: DB codes 23514/23502/22xxx → `validation` (`positions.ts:44-46`), 23503 → `wallet_not_found`/`category_not_found` by constraint name (`:53-56`), 23505 → `name_taken` (`wallets.ts:27`); RPC string outcomes → 404/409 (`move.ts:40-43`).
- Generic: DB `validation` surfaces as "Some values could not be saved. Check them and try again." (`new.astro:46`), i.e. the user does not learn which DB rule failed.
- Silently corrects: trigger overwrites posted `instrument` with the target symbol and nulls `market_listing_id` on insert (`20261102080240…:21-24`); `stamp_manual_price_save` overwrites save time (`20261030110418…:142`); `guard_position_listing` overwrites `listing_confirmed_at` (`:119-122`); wallet `currency` default 'USD' (`20261030140619…:8`).
- Swallowed (by design): duplicate same-day snapshot `on conflict do nothing` (`20261030122155…:50`); search results with non-EQUITY/ETF types dropped (`yahoo.ts:186`).
- Logs and continues: failed confrontation read → panel "unavailable", save still allowed (`new.astro:180-186`); failed wallet list on detail page hides Move (`[id].astro:104-111`); provider failures reported without payload (`market-prices.ts:52-58`).
- Sign-in errors pass Auth's message into the URL `?error=` (`api/auth/signin.ts:14-15`).

## Atomicity

- Create position with a new category — **not atomic**: category insert then position insert as separate requests; `positions.ts:243-245` "A category created here stays behind if the position insert then fails; that is acceptable." Finding (partial write by design).
- Search → target insert + receipt insert per candidate, separate requests (`market-selections.ts:93-130`); a failure mid-loop leaves orphan targets/receipts (inference, harmless).
- Move position — atomic: one RPC, both wallets locked in id order (`20261030140619…:36-48`).
- Close / price update / delete / restore — single-row UPDATE each (`positions.ts:143-150,191-207,308-315`).
- Download prices — multi-step across requests: claim (lease 30 s) → provider → finish RPC; each RPC is its own transaction (`20261030110418…:149-206`); target linking + target state in one RPC (`20261030162000…:103-139`). A crash between claim and finish leaves a lease that expires after 30 s ("Expiry alone never claims work" `:199`). Budget exhaustion releases claimed leases (`market-prices.ts:114-119`, `release_market_quote_refresh` `20261030114323…:91-101`).
- Snapshot capture — one SQL statement for all wallets (`20261030122155…:15-52`).
- Owner account creation — one transaction (`create-user.sql:12,59`).

## Scheduled and asynchronous work

- Daily wallet observation: `cron.schedule('wallet-daily-observations','0 0 * * *','select public.capture_wallet_snapshots()')` `20261028170000…:14-18`; the migration aborts unless `cron.timezone` is UTC/GMT (`:6-12`) and verifies exactly one active job (`:20-31`). Handler exists (`20261030122155…:15-52`), executable by `service_role` only; cron runs as the job owner (inference: `postgres`, superuser) so the revoke does not block it. Trigger → handler: confirmed. Repair helper `scripts/automation/configure-wallet-cron.mjs:4-11` re-applies the same migration locally.
  - Contradiction in comments: `20261028160000…:63` "Scheduling is activated separately on production" vs `20261028170000…:1` "applying this migration activates daily observations". Production state unknown.
- Lease and cooldown expiry are time comparisons inside claims (`20261030110418…:157-158`), no job needed.
- Selection receipts (`valid_until`) and `market_listing_lookups` rows have no cleanup job (grep `cron.schedule` → only the snapshot job). Finding: expired rows accumulate (inference, low impact).
- No queue, timer or provider polling found; downloads only on the POST (`endpoint.ts:33`).

## Unknowns

- Hosted Supabase Auth settings (sign-up disabled in production?) — `config.toml` is local only.
- Whether the production pg_cron job is active (see contradiction above).
- Content of operator SQL `context/deployment/automatic-stock-prices-manual-selection.sql` (out of scope).
- Cookie SameSite attributes for CSRF protection on form POSTs without origin checks (library default, not in repo).
- Category rename/remove behaviour: no code path exists, so no guard to inventory.

## Commands run

- `ls supabase/migrations supabase/rollbacks`, `find src -type f …`, `wc -l …`
- `cat -n` on every migration, middleware, auth routes, services, validation, endpoints, pages, `create-user.sql`, `configure-wallet-cron.mjs`
- `grep -n` on `supabase/config.toml` (auth/api keys)
- `grep -rnE '\.update\(|\.insert\(|\.delete\(|\.upsert\(|\.rpc\(' src scripts`; `grep -rn reason_text src`; `grep -rnE 'origin|sec-fetch' …`; `grep -rniE 'signUp|signup' src`; targeted greps in `yahoo.ts`, components, `demo-data.mjs`, observability config
