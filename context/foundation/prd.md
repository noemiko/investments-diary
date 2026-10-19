---
project: "Investments Diary"
version: 1
status: draft
created: 2026-09-20
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: 2026-11-04
  after_hours_only: true
---

# Investments Diary — Product Requirements

## Vision & Problem Statement

A private investor managing their own money makes buy and sell decisions guided by
emotion rather than by a clear strategy; their strategy is not itself clearly
articulated. At the moment of buying, at the moment of selling, and when reviewing past
positions, they cannot recall why an earlier decision was made, and they do not remember
all of their past investments. The only record today is the financial summary from their
brokers, which reports numbers without reasoning. The cost is repeated mistakes: the same
wrong decision is made again because the reason it was wrong has been forgotten.

Portfolio trackers record numbers, not theses. They have no field for "why", so they can
never close the loop between a reason and its outcome. Existing trade journals are built
for day traders and their entry and exit setups, not for the slow review of a long-term
investment rationale. And a diary only produces value if its entries are honest, which
favours a private personal tool over a social or commercial product.

## User & Persona

Primary persona: the author of the diary — a private retail investor who manages their
own money across one or more brokers. Single named user; the MVP serves exactly one
person. Keeping an investment diary is recognized good practice, which is part of why
this user wants one.

The moment they reach for the product: when buying a position, when selling a position,
and when reviewing past investments. They arrive with an incomplete memory of what they
already own and why they bought it.

## Success Criteria

### Primary

- Every position the author currently holds is recorded in the diary together with the
  reason it was bought, entered in the first sitting from broker summaries and memory.
- Before confirming a new investment, the author sees their existing positions bought for
  the same kind of reason, together with how those positions are performing, and can act
  on that information at the moment of the decision.

### Secondary

- Current prices update themselves from a live source, so unrealized results stay correct
  without the author typing them. Pleasant, but the product is not a failure without it —
  manual price entry is the MVP path.

### Guardrails

- Privacy of financial reasoning: theses and positions are never visible to another
  account and never exposed publicly. The honesty the diary depends on requires this.
- No silent data loss: an entry, once written, is never lost or overwritten without the
  author knowing.
- The application never writes or suggests the reason text. The moment the app drafts the
  reasoning, the record stops being evidence of what the author actually thought.
- Logging a position stays fast enough that the author does it at the moment of buying
  rather than postponing it. Slow entry kills the habit and therefore the product.

## User Stories

### US-01: Author is confronted with past reasoning while recording a new investment

- **Given** a signed-in author whose diary already holds at least one position with a reason category
- **When** they begin recording a new investment and choose its reason category
- **Then** they see their existing positions in that same category, each with its reason text and its current result, before the new entry is confirmed

#### Acceptance Criteria

- The confrontation appears before the new entry is saved, not after it.
- Only positions from the author's own diary are shown.
- When no earlier position shares the chosen category, an explanatory empty state is shown rather than a blank area.
- Each listed position shows enough to judge it: what was bought, the reason given, and the result so far.

# TODO: user stories for the back-filling, price-update and closing paths — see Open Questions

## Functional Requirements

### Account

- FR-001: User can create an account and sign in. Priority: must-have
  > Socrates: Counter-argument considered: "a local-only diary needs no accounts."
  > Resolution: kept, with the justification made honest — sign-in exists so the diary is
  > reachable from more than one device and survives the loss of a machine, not for
  > security in the abstract.
- FR-002: User can sign out. Priority: must-have
  > Socrates: Counter-argument considered: "nobody signs out of their own diary."
  > Resolution: kept — the diary may be opened on a shared or work machine, and sign-out
  > is what the privacy guardrail rests on there.

### Recording

- FR-003: User can record an investment with instrument, buy price and buy date required, and quantity and broker label optional. Priority: must-have
  > Socrates: Counter-argument considered: "five fields plus prose is too slow for the
  > moment of buying, and slow entry kills the habit." Resolution: revised — the three
  > fields needed to compute a result are required, the rest can be completed later.
- FR-004: User can write a free-text reason explaining why they bought. Optional. Priority: must-have
  > Socrates: Counter-argument considered: "the category alone is enough; prose will go
  > unwritten under time pressure." Resolution: revised — the category is required and the
  > prose is optional, accepting the risk that rushed entries carry no narrative.
- FR-005: User can define and later edit the list of reason categories, and assign one to each investment. Priority: must-have
  > Socrates: Counter-argument considered: "a list written now encodes a strategy the
  > author has not discovered yet." Resolution: revised — the list starts short and stays
  > editable as the author learns what their real categories are.
- FR-006: User can update the current price of an open position, and every displayed result shows the date its price was last updated. Priority: must-have
  > Socrates: Counter-argument considered: "manual prices go stale and a stale comparison
  > is worse than none." Resolution: revised — staleness is made visible rather than
  > prevented, so the author can discount an old number.
- FR-007: User can close a position by recording sell price and sell date. Priority: must-have
  > Socrates: Counter-argument considered: "a long-term investor rarely sells, so this may
  > go unused for months." Resolution: kept unchanged — a diary that cannot record an
  > ending can never answer why a position won or lost.
- FR-008: User can edit the factual fields of an investment; the written reason stops being editable shortly after it is first entered. Priority: must-have
  > Socrates: Counter-argument considered: "editing lets the author soften a foolish
  > thesis once the outcome is known, destroying the evidence." Resolution: revised —
  > prices, dates and labels stay correctable; the reasoning locks.
- FR-009: User can delete an investment; a deleted entry is recoverable rather than destroyed. Priority: must-have
  > Socrates: Counter-argument considered: "the author will delete exactly the embarrassing
  > trades the diary exists to preserve." Resolution: revised — deletion hides rather than
  > destroys, which also satisfies the no-silent-data-loss guardrail.

### Reviewing

- FR-010: User can see a list of all their positions, open and closed, with each row showing its reason category. Priority: must-have
  > Socrates: Counter-argument considered: "a list of instruments and numbers is the broker
  > summary again." Resolution: revised — the reason is visible in the list, so scanning it
  > means scanning the thinking rather than the holdings.
- FR-011: User can open one position and read its full written reason alongside its result. Priority: must-have
  > Socrates: Counter-argument considered: "redundant if the list already shows reasons."
  > Resolution: kept — a thesis of several sentences cannot be read in a table row.

### Confrontation

- FR-012: When recording a new investment, user sees their existing positions in the same reason category, each with its result, presented as a prompt to reflect rather than as a verdict. Priority: must-have
  > Socrates: Counter-arguments considered: "a handful of trades is noise, not evidence"
  > and "the decision was already made at the broker." Resolution: revised — it makes no
  > statistical claim. It asks whether the author has thought this before and how it went,
  > leaving the judgement to them.

### Wallets

- FR-013: User can keep several named wallets, each with a starting value, and every investment belongs to exactly one wallet. A wallet's value is its starting value plus the sum of (current price − buy price) × quantity over its non-deleted investments. Investments without a quantity or without a current price are left out of that sum and the wallet says how many were not counted; the value states the oldest price date it used. Wallets can be created and edited (name, starting value) but not deleted in the first version. Priority: should-have
  > Socrates: Counter-argument considered: "a wallet total is the broker summary again, and
  > the diary is about reasons, not holdings." Resolution: revised — the wallet adds no
  > verdict and no new number per position; it only sums results the diary already shows,
  > and an incomplete total is flagged rather than silently presented as whole.

## Non-Functional Requirements

- Recording a position, from opening the diary to a saved entry including choosing a
  reason, takes the author under 60 seconds.
- A position's reason and result are visible only to its author. No other account and no
  unauthenticated visitor can read any part of it.
- No entry disappears without the author confirming it, and any removed entry can be
  restored.
- Every displayed result states the date of the price it was computed from.

## Business Logic

Whenever the author records a new investment, the diary presents every earlier position
given the same reason, each with its outcome, before the entry is confirmed.

The rule consumes the reason the author is attaching to the investment they are about to
make, and every earlier investment in their diary carrying that same reason. Its output is
that subset of their own history, each entry paired with how it has turned out so far:
still open and up or down by some amount, or closed at a gain or a loss.

The author encounters it at the moment of recording, before the new entry is saved. It
makes no claim about whether the new investment is wise, offers no score and no
recommendation, and draws no statistical conclusion from a small number of positions. It
puts the author's own record for that kind of thinking in front of them and leaves the
judgement entirely to them.

The author states the purpose the rule serves in their own words: "App should help to
understand myself and improve my way of investing. Create better strategies and stick to
them." The stronger rule implied by "stick to them", in which the author declares a
strategy in advance and the diary flags investments falling outside it, was considered and
deliberately deferred beyond the first version on scope grounds.

## Access Control

Account-based login. The diary is gated behind authentication and is reachable from any
device the user signs in on.

Flat user model: one kind of user. An account owns its own diary and sees only its own
entries. There is no sharing, no read-only viewer, and no administrator role in the MVP.

Sign-up: open registration (resolved 2026-09-25). Anyone may create an account, so privacy
rests on every diary view being gated and every entry being readable only by its owner. An
unauthenticated visitor reaching a gated view is assumed to be redirected to sign-in, as the
existing route protection does — to be confirmed when that work is planned.

## Non-Goals

- **No declared strategy to judge buys against.** The author writes no strategy in advance
  and the diary never flags an investment as off-strategy. This is the stronger rule
  implied by the author's own goal of sticking to a strategy, deliberately held back so it
  cannot grow into the first version unnoticed.
- **No live price source.** Current prices are typed by the author. The integration is
  recorded as a secondary success criterion and stays out of the first version.
- **No brokers as managed records.** A broker is a text label on an investment. There is no
  screen for managing brokers and no fees, currencies or account numbers. Wallets (FR-013)
  are the author's own named groupings of investments, not broker accounts, and carry no
  currency, fees or account numbers either.
- **No sharing with anyone else.** No read-only links, no advisor access, no export for
  another person to read. The diary is single-tenant and private by construction, which is
  what the honesty the product depends on requires.

## Open Questions

1. ~~**How does the reason lock interact with the reason being optional?**~~ — **Resolved 2026-09-25:** an entry saved without a reason can have one added later; the lock window starts when the reason is first written, not when the entry is created.
2. ~~**What happens to past entries when a reason category is renamed or removed?**~~ — **Resolved 2026-09-25:** renaming a category updates its name everywhere, past entries included; removing one is a soft delete, and past entries still show the category name marked as removed. Still open, to settle when the work is planned: whether a removed category is offered for new entries, and whether it can be restored.
3. ~~**Sign-up behaviour and unauthenticated-visitor handling**~~ — **Resolved 2026-09-25:** open registration. A signed-out visitor on a gated view is assumed to be redirected to sign-in (to confirm when planned).
4. **User stories for the remaining paths** — only the confrontation path has acceptance criteria. Back-filling an existing holding, updating a price and closing a position do not. Owner: user. Resolve before implementation.
5. **Live price source as a later addition** — recorded as a secondary success criterion and an explicit non-goal for version one. Owner: user. No date.
6. **Wallets and the remaining position paths** — FR-013 sums open, non-deleted investments only. Still open: how a closed position's realised result counts in its wallet (decide with FR-007), whether an investment can move between wallets (decide with FR-008), and whether a wallet can be deleted. Owner: user.
