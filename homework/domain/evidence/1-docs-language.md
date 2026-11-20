# Evidence: language in the documents

All citations are `path:line`, relative to the repo root, and were read in this session (2026-11-05). Source code was not opened.

**Requirements (read in full):** `context/foundation/prd.md` (290 lines, front matter `updated: 2026-11-02`, `status: draft`, prd.md:4-6) and `context/foundation/shape-notes.md` (278 lines, `updated: 2026-09-20`, shape-notes.md:10). The PRD is the newest model. shape-notes is its 2026-09 predecessor.

**Narrative sample:**
- Titles: I read every `change.md` (16 archived + 2 open) and all of `context/foundation/roadmap.md` (updated 2026-11-02, roadmap.md:6).
- Plan briefs read in full (9): record-first-investment, position-detail-and-price, recoverable-delete, reason-confrontation, named-wallets, close-position, wallet-performance-dashboard, automatic-stock-prices, close-public-signup (open).
- Read in part: `ui-ux-redesign/plan-brief.md` (lines 1-40).
- Plans searched for rules (targeted ranges only): automatic-stock-prices/plan.md (1-70, 110-140, 186-210, 296-312), close-position/plan.md, named-wallets/plan.md, wallet-performance-dashboard/plan.md.
- `automatic-stock-prices/download-api.md` read in full.

**Narrative titled only (technical or non-domain):** bootstrap-verification, ui-tokens-onboarding, auth-email-callback (change.md read), result-correctness, mutation-baseline, add (Sentry), exa-context7-integration, consolidate-db-contract-tests; research.md, verification.md and reviews/ in every folder; ui-ux-redesign/frame.md and plan.md.

**Reference and engineering:** README.md:199-202 (product usage), CLAUDE.md (context only), `context/foundation/lessons.md` (rules), `context/foundation/test-plan.md` risk map (test-plan.md:46-53). Skipped as purely technical: health-check, infrastructure, tech-stack, test-stack, research-tools and deploy-plan. I did not open the operator SQL in `context/deployment/`.

## Terms

| term | variants | kind | definition / defining quote | source |
|---|---|---|---|---|
| Diary | investment diary, Investments Diary | thesis / entity (per-account container) | "An account owns its own diary and sees only its own entries." | prd.md:252; prd.md:19 |
| Author | user, owner, private investor | role | "the author of the diary — a private retail investor who manages their own money across one or more brokers. Single named user" | prd.md:37-38 |
| Owner (account creator) | the owner | role | "The owner creates each account outside the app with an email and a password, already confirmed." | prd.md:257-258 |
| Account | — | entity | "User can sign in to an account the owner created; nobody can create an account from the app or the public Auth API (amended 2026-11-02)" | prd.md:98-99 |
| Investment | entry, position, holding | entity | "User can record an investment with a supported Yahoo stock/ETF selected from search, buy price and buy date required, and quantity and broker label optional." | prd.md:117 |
| Position | open position, closed position, holding | entity (same as investment; doc vocabulary switches by context) | "a list of all their positions, open and closed" | prd.md:153; "holding" prd.md:188 |
| Entry | — | entity (the written record) | "an entry, once written, is never lost or overwritten without the author knowing" | prd.md:70-71 |
| Reason | reason text, written reason, thesis, reasoning, prose | value (owned by the position) | "User can write a free-text reason explaining why they bought. Optional." | prd.md:121; "thesis" prd.md:68 |
| Reason category | category, "same reason", "kind of reason" | entity (user-defined list) | "User can define and later edit the list of reason categories, and assign one to each investment." | prd.md:125; "the category is required and the prose is optional" prd.md:123-124 |
| Removed category | "marked as removed" | state | "removing one is a soft delete, and past entries still show the category name marked as removed" | prd.md:286 |
| Reason lock | "the reasoning locks", lock window | policy | "the written reason stops being editable shortly after it is first entered" | prd.md:142; prd.md:145; prd.md:285 |
| Factual fields | facts, "prices, dates and labels" | value group | "User can edit the factual fields of an investment" / "prices, dates and labels stay correctable" | prd.md:142, 145 |
| Instrument | instrument label, diary label, label | value | "Existing entries retain their labels and manual-price support." | prd.md:117; "The original diary label of an existing entry is retained" prd.md:177-178 |
| Stock selection | selection, creation-time selection, pending selection, search selection | entity / value | "Every investment requires a stock selection, enforced by the database." / "a holding's only stock identity is its creation-time selection" | prd.md:117; prd.md:188 |
| Listing | stock/ETF listing, Yahoo stock/ETF, confirmed listing, linked position | entity (provider identity) | "Confirmed listings supply regular-session prices to open-position results, confrontation views, wallet totals and future observations" | prd.md:178-180 |
| Selection receipt | search-choice receipt, "unsaved choices" | value (expiring) | "Unsaved choices expire after 30 minutes; saved holdings retain their durable target afterward." | download-api.md:89-90; plan.md (asp):193 |
| Pending target | durable target | entity | "Keep durable owner-scoped pending targets, unique by provider/symbol/exchange/instrument type, separate from expiring owner/wallet-bound search-choice receipts." | archive/2026-10-29-automatic-stock-prices/plan.md:193 |
| Buy price / buy date | — | value | Required (prd.md:117). "Per share" (record-first-investment/plan-brief.md:30). Buy date "Today or earlier, default today" (plan-brief.md:33). | prd.md:117 |
| Quantity / broker label | broker | value | Optional (prd.md:117). "A broker is a text label on an investment." | prd.md:275 |
| Current price | manual price, manual correction, price date | value | "User can update the current price of an open position, and every displayed result shows the date its price was last updated." | prd.md:129 |
| Manual correction | temporary override | policy / state | "a manual correction is retained separately and temporarily selects the manual price until a provider quote's market timestamp is strictly later than the correction's database-stamped save time" | prd.md:133-135 |
| Automatic quote | quote, saved quote, cached quote | value | "Quotes download server-side only after the user clicks **Download prices**" | prd.md:181 |
| Download prices | — | operation | "Prices download only when the user clicks **Download prices**; navigation and reloads display saved quotes without provider calls" | prd.md:63-64 |
| Effective price / price selection | shared price selection, effective manual/automatic price selection | policy | "through shared price selection" (prd.md:180-181). Order: "closed sale; temporary manual correction while the cached market timestamp is equal to or earlier than its save time; valid automatic quote; saved manual fallback; otherwise missing price." | asp plan.md:123 |
| Price time vs fetch time | market timestamp, fetch time | value | "Price time and fetch time remain distinct." | prd.md:197-198 |
| Cooldown | failed-attempt cooldown | policy | "Failed-attempt cooldown remains 15 minutes, or longer when required by the provider" | prd.md:193 |
| incompatible_currency | — | state | "mismatched wallets retain their manual values and report `incompatible_currency`" | download-api.md:68-69 |
| Result | outcome, current result, final result, realised / unrealised result | measure | "each entry paired with how it has turned out so far: still open and up or down by some amount, or closed at a gain or a loss" | prd.md:232-233 |
| Close / sale | sell price, sell date, sale facts | operation | "User can close a position by recording sell price and sell date." | prd.md:138 |
| Delete / restore | deleted entry, recoverable, soft delete | operation / state | "User can delete an investment; a deleted entry is recoverable rather than destroyed." | prd.md:146; prd.md:221-222 |
| Confrontation | same-reason panel, "the rule" | policy / operation (core rule) | "Whenever the author records a new investment, the diary presents every earlier position given the same reason, each with its outcome, before the entry is confirmed." | prd.md:227-228; FR-012 prd.md:163 |
| Wallet | named wallet, "Main" | entity | "User can keep several named wallets, each with an editable starting value, and assign every investment to one wallet." | prd.md:171; "Main at 0" named-wallets/plan-brief.md:22 |
| Starting value | — | value | Editable (prd.md:171). "starting values are nonnegative" | named-wallets/plan.md:48 |
| Live value | wallet value, wallet total | measure | "Live value is starting value plus realised results from closed positions and unrealised results from open positions, excluding deleted records." | prd.md:171 |
| Excluded (count) | excluded with a visible count | measure | "Missing quantity or an open position's missing quote is explicitly counted as excluded." | prd.md:171 |
| Freshness | oldest counted open quote | measure | "Freshness uses the oldest counted open quote only." | prd.md:171 |
| Denomination | wallet currency, USD/PLN/EUR | value / policy | "New wallets require USD, PLN or EUR, with no FX conversion or mixed-currency aggregation." | prd.md:202-203 |
| Reassignment | move between wallets | operation | "User can reassign a non-deleted open or closed position between their own wallets with matching currencies" | prd.md:209-210 |
| Observation | daily wallet-value observation, snapshot | entity (immutable) | "immutable daily wallet-value observations captured at midnight UTC" / "These are observations of recorded diary value, not reconstructed market-price or cash-balance history." | prd.md:172 |
| Wallet dashboard | — | operation / view | "Users can inspect 30/90/365-day or all-time ranges and point details." | prd.md:172 |
| Back-filling | existing holding | operation | "Back-filling an existing holding, updating a price and closing a position do not [have acceptance criteria]" | prd.md:288 |
| Declared strategy | off-strategy | thesis (non-goal) | "The author writes no strategy in advance and the diary never flags an investment as off-strategy." | prd.md:266-267 |
| Verdict | score, recommendation | thesis (forbidden) | "presented as a prompt to reflect rather than as a verdict" | prd.md:163; prd.md:235-237 |

## Lifecycles

**Position (investment)**
- *Recorded (open).* Requires a stock selection, buy price, buy date, a category and a wallet (prd.md:117, 123-124, 171). Saving does not download a quote (prd.md:117).
- *Open, unpriced.* Shown as "No price yet" (position-detail-and-price/plan-brief.md:32). The author prices it with a manual price "not future, not before buy date" (ibid.:31), or an automatic quote arrives on the first **Download prices** (prd.md:117, 186-187).
- *Open → closed.* "close a position by recording sell price and sell date" (prd.md:138). "Entire position only" and "Zero or positive" sell price (close-position/plan-brief.md:21-22). Sale date is "Buy date through UTC today" (ibid.:25). An acknowledgement is required (ibid.:26). "the first close wins" (ibid.:38). "Current-price writes also require an open-state predicate so a stale form cannot update a closed position" (close-position/plan.md:42).
- *Closed → open (reopen) or sale correction.* Not supported: "Defer corrections and reopening to S-07" (close-position/plan-brief.md:23). The PRD states no reopening rule (gap).
- *Any → deleted → restored.* "deletion hides rather than destroys" (prd.md:149-150). "Restorable forever, no purge" (recoverable-delete/plan-brief.md:37). A deleted position "must 404 on its detail page and refuse a price update" (position-detail-and-price/change.md:17). Deleted positions are hidden from the list and the confrontation (roadmap.md:157). They "retain assignment but disappear from membership and totals until restored" (named-wallets/plan.md:13). "Closed positions stay in the diary and can still be deleted/restored" (close-position/plan-brief.md:38).
- *Wallet reassignment.* Allowed for "a non-deleted open or closed position" (prd.md:209).
- *Stock selection.* Never changes: "A selection cannot be edited: an investment with the wrong stock is deleted and recreated." (prd.md:117)

**Stock selection (creation-time listing identity)**
- Search → receipt ("Unsaved choices expire after 30 minutes", download-api.md:89-90) → save → durable pending target (asp plan.md:193).
- First **Download prices**: "verifies trading currency/timezone before applying a price" (prd.md:117). On success the holding gets a confirmed listing. "The confirmed listing (`market_listing_id`) stays nullable." (asp plan.md:42)
- On a currency mismatch the holding keeps its manual values and reports `incompatible_currency` (download-api.md:68-69).
- Retired transition: re-linking or confirming a different listing for an existing holding. Requests "are rejected without provider work" (prd.md:188-190) and return "HTTP 409 ... `selection_already_set`" (download-api.md:37).

**Automatic quote and refresh**
- States: due → refreshing → succeeded, or failed with cooldown ("Unattempted symbols report `due`", "A concurrent claim reports `refreshing`", download-api.md:61-63).
- On failure: "Failed refreshes retain a valid cached automatic quote" (prd.md:195-196). "another download requires a later button click rather than an automatic retry" (prd.md:194).

**Manual correction (linked position)**
- Active from the database-stamped save time until "a provider quote's market timestamp is strictly later than the correction's database-stamped save time" (prd.md:134-136).
- "Equal or older market timestamps do not replace it" (prd.md:135-136).

**Reason text**
- absent → written → locked. "an entry saved without a reason can have one added later; the lock window starts when the reason is first written, not when the entry is created" (prd.md:285).
- How long the lock window lasts is not stated ("shortly", prd.md:142).
- Status: "S-07 ... proposed" (roadmap.md:57), so the lock is not delivered.

**Reason category**
- created (also inline in the form: "Pick or create inside the form", record-first-investment/plan-brief.md:32) → renamed ("updates its name everywhere, past entries included") → removed ("a soft delete", shown "marked as removed") (prd.md:286).
- Missing transitions: whether a removed category is offered for new entries, and whether it can be restored, are "Still open" (prd.md:286).
- Status: "S-08 ... proposed" (roadmap.md:58).

**Wallet**
- created, with a currency that "is frozen after creation" (prd.md:203-204) → edited (name, starting value) → never deleted: "Wallets can be created and edited but not deleted." (prd.md:171)
- Legacy path, now closed: "Existing wallets without a currency are assigned USD." (prd.md:203)

**Observation**
- Captured daily at midnight UTC and immutable. "later edits, sales, delete/restore and reassignment do not rewrite saved observations" (prd.md:172).
- "Earlier unavailable values and missed days are not backfilled" (prd.md:172). "missed observations remain gaps" (wallet-performance-dashboard/plan.md:107).
- Observations without a denomination inherit their wallet's currency (prd.md:172, 205-206).

**Account**
- The owner creates the account, already confirmed → the user signs in and signs out (prd.md:98-109, 255-258).
- The earlier self-service sign-up transition is removed (see Conflicting statements).

## Rules

| # | rule (quoted) | binds | scope | source |
|---|---|---|---|---|
| R1 | "theses and positions are never visible to another account and never exposed publicly" | position, reason, account | policy | prd.md:68-69; prd.md:219-220; prd.md:252 |
| R2 | "an entry, once written, is never lost or overwritten without the author knowing" | entry | policy | prd.md:70-71 |
| R3 | "No entry disappears without the author confirming it, and any removed entry can be restored." | entry, delete | policy | prd.md:221-222 |
| R4 | "The application never writes or suggests the reason text." | reason | policy | prd.md:72 |
| R5 | "Every displayed result states the date of the price it was computed from." | result, price date | policy | prd.md:223; prd.md:129 |
| R6 | "Recording a position, from opening the diary to a saved entry including choosing a reason, takes the author under 60 seconds." | recording | policy (NFR) | prd.md:217-218 |
| R7 | Confrontation: "presents every earlier position given the same reason, each with its outcome, before the entry is confirmed" and "makes no claim ... offers no score and no recommendation" | confrontation, category, result | policy (core) | prd.md:227-228, 235-237; US-01 AC prd.md:87-90 |
| R8 | "Only positions from the author's own diary are shown." / "When no earlier position shares the chosen category, an explanatory empty state is shown" | confrontation | entity / view | prd.md:88-89 |
| R9 | Deleted positions are excluded from the confrontation: "the confrontation must exclude positions with a `deleted_at`" | confrontation, delete | rule | reason-confrontation/change.md:11-12 |
| R10 | "the category is required and the prose is optional" | category, reason | position | prd.md:123-124 |
| R11 | "the written reason stops being editable shortly after it is first entered"; "the lock window starts when the reason is first written" | reason lock | position | prd.md:142, 285 |
| R12 | "New entries must have a server-validated listing selection when saved; a typed name alone is insufficient." / "Every investment requires a stock selection, enforced by the database." | stock selection | position | prd.md:117 |
| R13 | "A selection cannot be edited: an investment with the wrong stock is deleted and recreated." | stock selection | position | prd.md:117; prd.md:188-190 |
| R14 | "Search, selection and saving do not download quotes." / "Page loads, navigation, reloads, timers and snapshot capture do not fetch quotes" | download prices | policy | prd.md:117, 183-184 |
| R15 | "No currency or timezone is inferred from search metadata." | listing | policy | prd.md:190 |
| R16 | Manual correction precedence: "strictly later ... Equal or older market timestamps do not replace it, including after an identical manual-price resubmission." | manual price, quote | position | prd.md:133-136 |
| R17 | "Closed results use recorded sale values; deleted holdings are excluded." | result, close, delete | policy | prd.md:194-195 |
| R18 | Close: "Closing must be a single update conditional on the position still being open and non-deleted" (first close wins); "Zero or positive" sell price; "Entire position only" | close | position | close-position/plan.md:42; close-position/plan-brief.md:21-22 |
| R19 | Price date: "default today, not future, not before buy date" | current price | position | position-detail-and-price/plan-brief.md:31 |
| R20 | "assign every investment to one wallet"; "Every investment belongs to exactly one owned wallet." | wallet, position | position / wallet | prd.md:171; named-wallets/plan.md:13 |
| R21 | "Wallets can be created and edited but not deleted." | wallet | wallet | prd.md:171; prd.md:290 |
| R22 | Wallet names "are trimmed, 1–60 characters and unique per author ignoring case; starting values are nonnegative" | wallet | wallet | named-wallets/plan.md:48 |
| R23 | "Live value is starting value plus realised results from closed positions and unrealised results from open positions, excluding deleted records." | live value | wallet | prd.md:171 |
| R24 | "Missing quantity or an open position's missing quote is explicitly counted as excluded. Freshness uses the oldest counted open quote only." | live value | wallet | prd.md:171 |
| R25 | "New wallets require USD, PLN or EUR, with no FX conversion or mixed-currency aggregation." / "Wallet currency is frozen after creation" | denomination | wallet / policy | prd.md:202-204 |
| R26 | "A linked position's quote currency must match its wallet currency." | denomination, listing | position | prd.md:205 |
| R27 | Reassignment only "between their own wallets with matching currencies ... Conflicting denominations are rejected." It "does not convert historical amounts" | reassignment | position | prd.md:209-213 |
| R28 | Observations are "immutable"; "later edits, sales, delete/restore and reassignment do not rewrite saved observations"; no backfill; "Capture ... performs no provider downloads" | observation | observation | prd.md:172 |
| R29 | "Nobody can create an account from the app or from the public Supabase Auth sign-up API; the app has no sign-up page." | account | policy | prd.md:256-257 |
| R30 | "every diary view being gated and every entry being readable only by its owner" | access | policy | prd.md:259 |
| R31 | Category ownership: "Row security alone would accept another user's category id" → composite FK `(category_id, user_id)` | category, position | position | record-first-investment/plan-brief.md:36 |
| R32 | "Same stock twice → Two separate positions" | position | position | record-first-investment/plan-brief.md:31 |
| R33 | Users get "access to only their own rows" in every new table | all tables | policy | lessons.md:73; CLAUDE.md tripwire |
| R34 | "Results ... free of verdicts": "No gain/loss colours; the sign carries direction" | result display | policy | position-detail-and-price/plan-brief.md:37; ui-ux-redesign/plan-brief.md:35 |

## Multiple meanings

- **"reason".** It means the reason category in the business rule: "every earlier position given the same reason" (prd.md:227). The same rule is stated per category in FR-012, "positions in the same reason category" (prd.md:163). Elsewhere "reason" means the free text: "write a free-text reason" (prd.md:121). The confrontation groups by category, not by text. *Inference:* "same reason" in prd.md:227-231 is shorthand for "same reason category".
- **"confirm" / "confirmed"** has five senses:
  1. Saving an entry: "before the entry is confirmed" (prd.md:228).
  2. A provider-verified listing: "Confirmed listings supply ... prices" (prd.md:178).
  3. An email-confirmed account: "already confirmed" (prd.md:258).
  4. Retired wallet-currency confirmation: "no deferred confirmation or attestation flow remains" (prd.md:204).
  5. Retired listing confirmation for existing holdings (prd.md:187).
  It also appears as the delete acknowledgement (prd.md:221) and the close acknowledgement (close-position/plan-brief.md:26).
- **"selection"** means two things. (a) The stock selection, the identity chosen at creation (prd.md:117). (b) Effective price selection, the valuation source precedence ("shared price selection", prd.md:180-181; "effective manual/automatic price selection", prd.md:172).
- **"investment" / "position" / "holding" / "entry"** are used for the same record. FR-003 says "investment", FR-010 says "positions", FR-014 says "holding", and the guardrails say "entry" (prd.md:117, 153, 188, 70). *Inference:* one entity; "entry" stresses the written record, "holding" stresses an owned listing.
- **"instrument"** first meant the free-text required field ("instrument, buy price and buy date required", shape-notes.md:153). Now it is a label derived from the selection ("derives the instrument from that selection", download-api.md:87-88; "the original diary label", prd.md:177-178).
- **"deleted" / "removed".** For a position it is a soft delete that can be restored (prd.md:146). For a category it is a soft delete shown "marked as removed", and whether it can be restored is open (prd.md:286). "removed entry" in the NFR (prd.md:221) means a deleted position.
- **"result"** is a percentage only in display ("The displayed result is the percentage only", position-detail-and-price/change.md:23). It is an amount in wallet totals ("realised results ... unrealised results", prd.md:171). It is "final" for closed positions (close-position/plan-brief.md:28).
- **"wallet" vs "broker".** "Wallets (FR-013) are the author's own named groupings of investments, not broker accounts." (prd.md:276-277). A broker is only a label (prd.md:275).
- **"observation" vs "snapshot".** The PRD says "observations" (prd.md:172). The change folder calls the same thing "wallet_snapshots storage" (wallet-performance-dashboard/plan.md:29) and "snapshot capture" (prd.md:184).

## Conflicting statements

| topic | older statement | newer statement (wins) |
|---|---|---|
| Sign-up | "FR-001: User can create an account and sign in." (shape-notes.md:141, 2026-09-20); "Resolved 2026-09-25: open registration" (prd.md:287, struck through) | "owner-created accounts only; nobody can create an account from the app or the public Auth API" (prd.md:98-99, 255-258, 287; 2026-11-02). **Stale:** roadmap S-06 outcome still says "register and reach only their own diary" (roadmap.md:56). The change implementing it is still open: close-public-signup `status: implementing` (changes/close-public-signup/change.md:4), roadmap S-10 "in-progress" (roadmap.md:60). |
| Reason lock vs optional reason | "A rushed entry saved without a reason could therefore never be completed." (shape-notes.md:264, open) | "the lock window starts when the reason is first written" (prd.md:285, resolved 2026-09-25). Wording changed from "becomes read-only" (shape-notes.md:173) to "stops being editable" (prd.md:142), with the same meaning. |
| Category rename/remove | Open question (shape-notes.md:265) | Rename updates everywhere; removal is a soft delete marked as removed (prd.md:286). Offering and restoring a removed category stay open. |
| Price source | "No live price source. Current prices are typed by the author." (shape-notes.md:251-252) | FR-014 automatic prices via **Download prices** (prd.md:176-200; OQ5 resolved 2026-10-30, prd.md:289). **Stale:** the roadmap still lists "Live price source — Why parked" (roadmap.md:273) and calls it an "explicit non-goal" (roadmap.md:267). |
| Instrument identity | "instrument ... required" free text (shape-notes.md:153; record-first-investment/change.md:13) | Required Yahoo selection, enforced by the DB, with existing drafts assigned Apple `AAPL` (prd.md:117, 2026-11-02). |
| Listing confirmation for existing holdings | "Existing-position quote confirmation remains supported." (asp plan.md:30, 2026-10-30); "Existing unlinked holdings still support explicit quote lookup and confirmation." (asp plan-brief.md:13); "Existing positions ... do not acquire guessed selections" (asp plan.md:28) | "Existing-position listing confirmation is retired (2026-11-02)" (prd.md:187-190); "assigned Apple ... by owner decision" (asp plan.md:42; prd.md:117). The plan-brief itself is internally inconsistent between line 13 and line 29. |
| Wallet currency | "no fees, currencies or account numbers" (shape-notes.md:254); "Excluded: ... currencies" (named-wallets/plan-brief.md:31); "Add nullable legacy wallet currency ... Confirmation ... Freeze confirmed currency" (asp plan.md:116) | USD/PLN/EUR required; unset wallets become USD; no attestation (prd.md:202-206; asp plan.md:7-17, 2026-10-30). Roadmap S-09 risk still says "without currencies" (roadmap.md:221). |
| Wallet total | "starting value plus the sum of (current price − buy price) × quantity over its non-deleted investments" (roadmap.md:211; named-wallets/plan.md:15); OQ6 "narrows this to open investments" (roadmap.md:268) | Starting value + realised (closed) + unrealised (open), excluding deleted (prd.md:171; close-position/plan-brief.md:24). |
| Reassignment | "Reassignment — Defer to S-07" (named-wallets/plan-brief.md:24); roadmap unknowns (roadmap.md:190, 219) | FR-016 allows owned-wallet reassignment with matching currency (prd.md:209-213; OQ6 resolved 2026-10-30, prd.md:290). The roadmap still lists it as an S-07 unknown. |
| Price storage | "Latest price and date as two columns on `positions`, overwritten on update" (position-detail-and-price/plan-brief.md:33) | The manual correction is "retained separately", and the quote cache is separate (prd.md:133; asp plan.md:119-121). |
| Observation pricing | "Observations use manual quotes and can be stale" (wallet-performance-dashboard/plan-brief.md:38) | "Future observations use the same effective manual/automatic price selection as the application" (prd.md:172). |
| Result display | "Percentage always; amount too when quantity is set" (position-detail-and-price/plan-brief.md:30) | "The displayed result is the percentage only" (position-detail-and-price/change.md:23, 2026-10-15); "Retain percentage-only" (close-position/plan-brief.md:28). |
| Confrontation gating | "before the entry is confirmed" / "The confrontation appears before the new entry is saved" (prd.md:87, 228) | Planned trade-off: "saving never gated" and "A no-JS author on a first load can save without seeing the panel" (reason-confrontation/plan-brief.md:34, 80). This is a tension with the PRD, not a PRD revision. |
| Test-plan wording vs open change | "a second account (owner-created; public sign-up is closed)" (test-plan.md:50) | close-public-signup is still `implementing` (changes/close-public-signup/change.md:4). The documents describe the closure as done before the change is archived. |

## Unknowns

- **Reason-lock duration.** The window is only "shortly" (prd.md:142). No document gives a duration. The roadmap lists the slice as proposed (roadmap.md:57).
- **Removed categories.** Whether a removed category is offered for new entries, and whether it can be restored: "Still open" (prd.md:286; roadmap.md:205).
- **Missing acceptance criteria.** Back-fill, price update and close have none: "Owner: user. Resolve before implementation." (prd.md:288).
- **Closing a position.** No rule covers reopening or correcting a sale. It was deferred to S-07 (close-position/plan-brief.md:23), which does not include it in its outcome (roadmap.md:183).
- **Partial sales.** "Entire position only" (close-position/plan-brief.md:21). The PRD is silent.
- **Signed-out visitor.** Behaviour on a gated view is "assumed to be redirected to sign-in ... to be confirmed" (prd.md:260-262; roadmap.md:177).
- **Editing factual fields (FR-008).** Not yet delivered (S-07 proposed, roadmap.md:57). How editing the buy date interacts with the price-date check is flagged as a constraint (position-detail-and-price/plan-brief.md:77).
- **Non-deleted vs deleted positions in reassignment.** FR-016 allows only "non-deleted" positions to be reassigned (prd.md:209). No document says what happens to a deleted position's wallet on restore beyond "retain assignment" (named-wallets/plan.md:13).
- **Roadmap is stale relative to the PRD.** OQ5, OQ6, S-06, S-09 and Parked still reflect pre-2026-10-30 statements. S-03 is "done" in the table (roadmap.md:53) but missing from the Done list (roadmap.md:280-288).
- **Searches with no result.** I found no document that defines a "strategy" entity (non-goal only, prd.md:264-268). No document defines fees, FX or cash proceeds; all are excluded (prd.md:270-278; close-position/plan-brief.md:34).

## Commands run

- `nl -ba` / `sed -n` / `cut` on prd.md, shape-notes.md, roadmap.md, lessons.md, README.md, every `change.md`, nine `plan-brief.md` files, `download-api.md`
- `ls` / `wc -l` on `context/archive`, `context/changes`, `context/foundation`
- `grep -n -i -E` over automatic-stock-prices/plan.md, close-position/plan.md, named-wallets/plan.md, wallet-performance-dashboard/plan.md, test-plan.md, README.md
