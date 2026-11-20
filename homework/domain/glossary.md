# Investments Diary — Agent Glossary

Use these distinctions when discussing the domain. Existing code names are mappings, not instructions to rename APIs. “Not implemented” describes a requirement rather than a working capability.

| Term | What it means | Name used in the code | What NOT to call it |
|---|---|---|---|
| Diary | One author's private investment reasoning record | Implicit owner-scoped rows | Public portfolio, shared journal |
| Author | Person who records their own investments and reasons | `user_id`, `locals.user` | Advisor, administrator |
| Position | One recorded investment with purchase facts, category and eventual sale | `positions`, `PositionDetail`; UI also says investment | Broker account, order, transaction ledger |
| Purchase facts | Buy price/date, optional quantity and broker label | `buy_price`, `buy_date`, `quantity`, `broker_label` | Original reasoning |
| Reason | Author's optional free-text explanation of why they bought | `reason_text` | Generated thesis, error reason |
| Reason category | Required author-defined kind of reasoning used to find comparable positions | `reason_categories`, `category_id`, `ReasonCategory` | Strategy, instrument type |
| Reason lock | Required protection against editing prose after a short first-writing window; duration undecided | Not implemented; comments only | Existing database guard |
| Removed category | Retired category retained and marked on historical positions | `deleted_at` storage exists; workflow/marker not implemented | Erased category |
| Confrontation | Showing same-category past positions and their dated outcomes during recording | `confrontationState`, `listConfrontationPositions`, `ConfrontationPanel` | Recommendation, verdict, strategy score |
| Result | A dated percentage gain/loss and, when quantity exists, monetary change | `positionResult`, `describeResult` | Command success, investment recommendation |
| Open / closed | Without sale / with complete sale price and sale date | Nullable `sell_price` and `sell_date` pair | Active / deleted |
| Close | Record sale of the entire position; zero sale price is valid | `closePosition` | Partial exit, cash withdrawal |
| Delete / restore | Hide a position from active views / bring it back with facts preserved | `deletePosition`, `restorePosition`, `deleted_at` | Hard delete, erase, close |
| Broker label | Optional text naming where the investment was bought | `broker_label` | Managed broker, wallet, broker account |
| Stock selection | Durable stock identity chosen when the position is created | `market_target_id`, `market_listing_targets` | Editable ticker, quote, receipt |
| Selection receipt | Expiring owner/wallet-bound proof of a search choice before saving | `market_selection_receipts`, `listing_receipt_id` | Durable holding identity |
| Instrument label | Stored display label; distinct from provider identity | `instrument` | Verified listing identity |
| Listing | Exchange-specific stock/ETF identity with verified currency and timezone | `MarketListing`, `market_listing_id` | Symbol alone, broker account |
| Automatic quote | Cached provider regular-session price with market and fetch times | `MarketQuote`, `market_quote_cache` | Real-time feed, guaranteed current price |
| Manual price / correction | Author-entered price/date; eligible correction wins until a strictly later market quote | `current_price`, `price_date`, `manual_price_saved_at` | Automatic quote, effective price |
| Effective price | Selected sale, correction, automatic or fallback price, or missing coverage | `position_effective_prices`, `selected_price`, `EffectivePrice`; open read DTO uses `current_price` | Always the manual price |
| Download prices | Explicit authenticated action fetching quotes; search only retrieves listing metadata | Download endpoint, `DownloadPrices` | Background sync, page-load refresh |
| Cooldown / lease | Waiting after failure / temporary exclusive claim to refresh work | `cooldown_until`, `lease_token`, `lease_until` | Automatic retry schedule |
| Wallet | Named grouping with starting value and fixed currency | `wallets`, `Wallet` | Brokerage account, cash account |
| Starting value | Editable nonnegative basis for diary performance value | `starting_value` | Cash balance, deposit transaction |
| Denomination | Wallet's fixed USD, PLN or EUR currency without conversion | `wallets.currency` | FX conversion, mixed-currency total |
| Live value | Starting value plus counted realised and unrealised monetary results | `walletValue` | Cash balance, sale proceeds, market value of holdings |
| Excluded coverage | Count of positions lacking quantity or a usable open price | `notCounted`, `not_counted` | Zero-return investments |
| Freshness | Oldest counted open quote date; sale dates do not determine it | `asOf`, `as_of` | Latest fetch time |
| Reassignment | Move a non-deleted position between the author's same-currency wallets | `movePosition`, `move_position_to_wallet` | Broker transfer, currency conversion |
| Observation | Immutable daily cached diary-value record; missed history is not reconstructed | `wallet_snapshots`, `WalletSnapshot`, `capture_wallet_snapshots` | Historical market-price series, cash ledger |
| Account | Owner-provisioned authentication identity | Supabase Auth user | Wallet, public registration |
