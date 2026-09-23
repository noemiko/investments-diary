---
project: "Investments Diary"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
created: 2026-09-20
updated: 2026-09-20
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "reasoning is lost; emotional decisions at the moment of action"
    - topic: "insight"
      decision: "trackers record numbers not theses; existing journals target day traders; honesty requires privacy"
    - topic: "primary persona scope"
      decision: "single named user — the author"
    - topic: "access model"
      decision: "account-based login; gated, reachable from any device"
    - topic: "role separation"
      decision: "flat — one kind of user; no sharing or admin role in MVP"
    - topic: "payoff moment"
      decision: "confront at buy time — show past reasons of the same kind and their results"
    - topic: "broker representation"
      decision: "label on the investment, not a managed entity"
    - topic: "cold-start outcome data"
      decision: "unrealized result from manually updated current price"
    - topic: "domain rule"
      decision: "surface the author's own past positions sharing the new reason, with outcomes, before the entry is confirmed"
    - topic: "declared-strategy check"
      decision: "deferred beyond first version on scope grounds"
  frs_drafted: 12
  quality_check_status: accepted
timeline_budget:
  mvp_weeks: 6
  hard_deadline: 2026-11-04
  after_hours_only: true
---

# Shape Notes — Investments Diary

## Seed idea (verbatim)
> Investments diary for personal use: record each past and new investment with the
> reasoning behind it, close it with the result, and review outcomes against the
> original thesis. Manual price entry in the MVP. Open questions: which single domain
> rule to implement (return per reasoning tag, or thesis-versus-outcome flag);
> whether a live stock-price source is added later as an optional feature.

## Vision & Problem Statement
A private investor managing their own money makes buy and sell decisions guided by
emotion rather than by a clear strategy; their strategy is not itself clearly
articulated. At the moment of buying, at the moment of selling, and when reviewing
past positions, they cannot recall why an earlier decision was made, and they do not
remember all of their past investments. The only record today is the financial summary
from their brokers, which reports numbers without reasoning. The cost is repeated
mistakes: the same wrong decision is made again because the reason it was wrong has
been forgotten.

Portfolio trackers record numbers, not theses. They have no field for "why", so they
can never close the loop between a reason and its outcome. Existing trade journals are
built for day traders and their entry and exit setups, not for the slow review of a
long-term investment rationale. And a diary only produces value if its entries are
honest, which favours a private personal tool over a social or commercial product.

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
- Before confirming a new investment, the author sees their existing positions bought
  for the same kind of reason, together with how those positions are performing, and
  can act on that information at the moment of the decision.

### Secondary

- Current prices update themselves from a live source, so unrealized results stay
  correct without the author typing them. Pleasant, but the product is not a failure
  without it — manual price entry is the MVP path.

### Guardrails

- Privacy of financial reasoning: theses and positions are never visible to another
  account and never exposed publicly. The honesty the diary depends on requires this.
- No silent data loss: an entry, once written, is never lost or overwritten without the
  author knowing.
- The application never writes or suggests the reason text. The moment the app drafts
  the reasoning, the record stops being evidence of what the author actually thought.
- Logging a position stays fast enough that the author does it at the moment of buying
  rather than postponing it. Slow entry kills the habit and therefore the product.

## Timeline acknowledgment
Acknowledged on 2026-09-20: the first working version is budgeted at roughly 30 hours
of after-hours work spread over about six weeks, on a stack the author has not used
before. The scope-cost was surfaced during discovery — four user actions, one entity,
one domain rule — and the author accepted it as realistic on condition that the
confrontation rule stays simple and no second managed entity is added.

Concrete cuts held in reserve if the budget slips: drop the manual price-update step
and fall back to closed positions only; or drop the grouping in the confrontation panel
and show a flat list of past reasons.

## User Stories
### US-01: Author is confronted with past reasoning while recording a new investment

- **Given** a signed-in author whose diary already holds at least one position with a reason category
- **When** they begin recording a new investment and choose its reason category
- **Then** they see their existing positions in that same category, each with its reason text and its current result, before the new entry is confirmed

#### Acceptance Criteria

- The panel appears before the new entry is saved, not after it.
- Only positions from the author's own diary are shown.
- When no earlier position shares the chosen category, an explanatory empty state is shown rather than a blank area.
- Each listed position shows enough to judge it: what was bought, the reason given, and the result so far.

> Draft derived from the flow the author described in Phase 3. Confirm or correct before `/10x-prd`.

## Functional Requirements
### Account

- FR-001: User can create an account and sign in. Priority: must-have
  > Socrates: Counter-argument considered: "a local-only diary needs no accounts."
  > Resolution: kept, with the justification made honest — sign-in exists so the diary
  > is reachable from more than one device and survives the loss of a machine, not for
  > security in the abstract.
- FR-002: User can sign out. Priority: must-have
  > Socrates: Counter-argument considered: "nobody signs out of their own diary."
  > Resolution: kept — the diary may be opened on a shared or work machine, and
  > sign-out is what the privacy guardrail rests on there.

### Recording

- FR-003: User can record an investment with instrument, buy price and buy date required, and quantity and broker label optional. Priority: must-have
  > Socrates: Counter-argument considered: "five fields plus prose is too slow for the
  > moment of buying, and slow entry kills the habit." Resolution: revised — the three
  > fields needed to compute a result are required, the rest can be completed later.
- FR-004: User can write a free-text reason explaining why they bought. Optional. Priority: must-have
  > Socrates: Counter-argument considered: "the category alone is enough; prose will go
  > unwritten under time pressure." Resolution: revised — the category is required and
  > the prose is optional, accepting the risk that rushed entries carry no narrative.
- FR-005: User can define and later edit the list of reason categories, and assign one to each investment. Priority: must-have
  > Socrates: Counter-argument considered: "a list written now encodes a strategy the
  > author has not discovered yet." Resolution: revised — the list starts short and
  > stays editable as the author learns what their real categories are.
- FR-006: User can update the current price of an open position, and every displayed result shows the date its price was last updated. Priority: must-have
  > Socrates: Counter-argument considered: "manual prices go stale and a stale
  > comparison is worse than none." Resolution: revised — staleness is made visible
  > rather than prevented, so the author can discount an old number.
- FR-007: User can close a position by recording sell price and sell date. Priority: must-have
  > Socrates: Counter-argument considered: "a long-term investor rarely sells, so this
  > may go unused for months." Resolution: kept unchanged — a diary that cannot record
  > an ending can never answer why a position won or lost.
- FR-008: User can edit the factual fields of an investment; the written reason becomes read-only shortly after it is first entered. Priority: must-have
  > Socrates: Counter-argument considered: "editing lets the author soften a foolish
  > thesis once the outcome is known, destroying the evidence." Resolution: revised —
  > prices, dates and labels stay correctable; the reasoning locks.
- FR-009: User can delete an investment; a deleted entry is recoverable rather than destroyed. Priority: must-have
  > Socrates: Counter-argument considered: "the author will delete exactly the
  > embarrassing trades the diary exists to preserve." Resolution: revised — deletion
  > hides rather than destroys, which also satisfies the no-silent-data-loss guardrail.

### Reviewing

- FR-010: User can see a list of all their positions, open and closed, with each row showing its reason category. Priority: must-have
  > Socrates: Counter-argument considered: "a list of instruments and numbers is the
  > broker summary again." Resolution: revised — the reason is visible in the list, so
  > scanning it means scanning the thinking rather than the holdings.
- FR-011: User can open one position and read its full written reason alongside its result. Priority: must-have
  > Socrates: Counter-argument considered: "redundant if the list already shows
  > reasons." Resolution: kept — a thesis of several sentences cannot be read in a
  > table row.

### Confrontation

- FR-012: When recording a new investment, user sees their existing positions in the same reason category, each with its result, presented as a prompt to reflect rather than as a verdict. Priority: must-have
  > Socrates: Counter-arguments considered: "a handful of trades is noise, not
  > evidence" and "the decision was already made at the broker." Resolution: revised —
  > the panel makes no statistical claim. It asks whether the author has thought this
  > before and how it went, leaving the judgement to them.

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
make, and every earlier investment in their diary carrying that same reason. Its output
is that subset of their own history, each entry paired with how it has turned out so far:
still open and up or down by some amount, or closed at a gain or a loss.

The author encounters it at the moment of recording, before the new entry is saved. It
makes no claim about whether the new investment is wise, offers no score and no
recommendation, and draws no statistical conclusion from a small number of positions. It
puts the author's own record for that kind of thinking in front of them and leaves the
judgement entirely to them.

The author states the purpose the rule serves in their own words: "App should help to
understand myself and improve my way of investing. Create better strategies and stick to
them." The stronger rule implied by "stick to them", in which the author declares a
strategy in advance and the diary flags investments falling outside it, was considered
and deliberately deferred beyond the first version on scope grounds.

## Access Control
Account-based login. The diary is gated behind authentication and is reachable from
any device the user signs in on.

Flat user model: one kind of user. An account owns its own diary and sees only its own
entries. There is no sharing, no read-only viewer, and no administrator role in the MVP.

Unresolved and routed to Open Questions: sign-up behaviour (open registration versus a
single provisioned account), and what an unauthenticated visitor sees when they reach a
gated view.

## Non-Goals
- **No declared strategy to judge buys against.** The author writes no strategy in advance
  and the diary never flags an investment as off-strategy. This is the stronger rule
  implied by the author's own goal of sticking to a strategy, deliberately held back so it
  cannot grow into the first version unnoticed.
- **No live price source.** Current prices are typed by the author. The integration is
  recorded as a secondary success criterion and stays out of the first version.
- **No brokers as managed records.** A broker is a text label on an investment. There is
  no screen for managing brokers and no fees, currencies or account numbers.
- **No sharing with anyone else.** No read-only links, no advisor access, no export for
  another person to read. The diary is single-tenant and private by construction, which
  is what the honesty the product depends on requires.

## Open Questions
1. **Which single domain rule?** — return per reasoning tag, or thesis-versus-outcome flag. Owner: user. To resolve in Phase 5.
2. **Live stock-price source as a later optional feature?** — Owner: user. Deferred; not in MVP, recorded as a secondary success criterion.
3. **Sign-up behaviour and unauthenticated-visitor handling** — open registration vs. a single provisioned account; what a gated route shows when signed out. Owner: user. Resolve before implementation.
4. **How does the reason lock interact with the reason being optional?** — FR-004 makes the prose optional and FR-008 locks it shortly after entry. A rushed entry saved without a reason could therefore never be completed. Owner: user. Blocks the entry form's design.
5. **What happens to past entries when a reason category is renamed or removed?** — FR-005 allows the list to evolve. Owner: user. Resolve before implementation.

## Forward: tech-stack
Informational only. Not part of the PRD schema; consumed by the tech-stack step.

The author stated a learning goal of working with coding agents, and named a candidate
stack they want to learn rather than one chosen from the product's requirements:
Astro 6, React 19, TypeScript, Tailwind CSS 4, Supabase, Cloudflare. Ten years of
professional Python experience and prior work with AWS; no prior experience with the
named stack.

Treat this as a preference with a learning motive behind it, not a decision derived from
the product. The tech-stack step should test it against the product's actual needs.
