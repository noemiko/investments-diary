# Module 4 — Consolidated Architecture Report

Evidence: supplied artifacts only. Source keys below identify their originating repositories; code references quoted by those artifacts were not independently re-audited for this report.

## 1. Projects Covered

| Project | Stack and approximate scale | Module artifacts |
|---|---|---|
| **Django** (`django-10x/django`) | Python framework package with auxiliary JavaScript tooling and database backends. L2's production-Python graph contains **700 nodes and 3,328 edges**, excluding tests/docs; this is graph scope, not total repository size. | **L2** repository map; **L3** persistence research; **L4** C1 refactoring plan. L2/L3 record revision `b501b849…`. |
| **Investments Diary** (`xdev10/investments-diary`) | Astro 7, React 19, TypeScript 6, Tailwind 4, Node 24.x, Supabase/PostgreSQL, Vercel. Private investment-reasoning diary with UI, services, SQL rules and market-data integration. | **L5** domain distillation, invariant/aggregate design, ACL plan and glossary; distillation records revision `b111cc7`. |

Sources: **[M]** Django `context/map/repo-map.md`; **[R]** Django `context/changes/post-flow-analysis/research.md`; **[P]** Django `context/changes/refactor-opportunities/plan.md`; **[D]** Investments Diary `context/domain/01-domain-distillation.md`; **[I]** `context/domain/02-invariant-aggregate-refactor.md`; **[G]** `context/domain/glossary.md`; **[A]** `context/domain/03-anti-corruption-layer.md`.

## 2. Project Map — L2

- **Risk zones:** query correctness, cross-backend execution/schema behavior, admin editing/permissions, and untrusted-input handling warrant review because repair history coincides with structural contracts. These are review priorities, not production incident rankings. [M §4]
- **Complexity centers:** ORM query construction/compiler contracts and the admin `options.py` coordination hub deserve deeper inspection. Thin public facades can have many imports, while dynamic compiler dispatch hides behavioral reach. [M §§2–3]
- **Entry points:** start with `django/__main__.py`, `django/apps/__init__.py` and `django/db/__init__.py`; follow backend loading through `django/db/utils.py`, then QuerySet/compiler behavior and admin hooks. [M §6]
- **Important unknowns:** the graph excludes JavaScript, templates/CSS, tests/docs, native spatial libraries and external applications; dynamic dependencies are partial. GeoDjango cycles and runtime behavior were not validated, and open-bug counts were unavailable. [M §7]

## 3. Feature Analysis — L3

**Investigated flow: model saving, updating and readback**, connecting L2's ORM/query-correctness, backend-contract and admin-editing risk zones. [R, Research question and scope]

Input comes from application calls or, in the traced HTTP example, an admin editing request validated through ModelForm. Instance saving prepares relations, selects the write database/fields, saves parent/local tables through query/compiler/backend contracts, then assigns or defers returned fields and updates instance state. Default `Model.save()` returns `None`; `create()` returns an instance, whereas public `update()` returns an affected-row count. Admin additionally persists related objects, logs the change and constructs its response within an outer transaction. [R, Feature overview]

**Priority technical debt risks:**

1. **Alias/readback inconsistency — ast-grep confirmed in the supplied research.** Audit **S17** confirms that partial-write selection accepts field name or attname, but expression readback checks the name (`base.py:1100`, `:1140–1147`). Scalar FK-alias and ordinary expression tests do not establish their combination (S40); L3 identifies an asymmetry, without claiming runtime reproduction. [R, audit and test gaps]
2. **Backend-dependent blast radius:** compiler selection is dynamic; returning capabilities, converters and deferred loading connect model behavior to backend contracts. The static graph does not enumerate downstream applications, so it cannot quantify their impact. [R, S21–S25, S30, S44]
3. **Transaction/signal coupling:** `post_save` precedes completion of admin's outer transaction; it is not a commit notification. Combined inheritance-failure/signal-side-effect coverage remains unestablished by the inspected tests. [R, Behavioral implications; S42]

## 4. Refactoring Plan — L4

**Selected option C1:** make FK expression readback consistent for `update_fields={"profile"}` and `{"profile_id"}`. The target is a local decision based on already-selected `Field` objects: remove the redundant name-only predicate, retaining native returning or deferred retrieval, and original signal spellings. [P, Overview; Phase 2]

**OUT OF SCOPE:** C2–C4, exception/comment cleanup, result abstractions, compiler/queryset protocol changes, eager refresh, schema/API changes, new combined fetch-mode/exceptional-async/inherited-rollback tests, upstream submission and native MySQL/MariaDB validation. [P, What We're NOT Doing]

- **Phase 1 — Capture regression:** baseline suites and failing alias-expression tests on SQLite/PostgreSQL, checking stored values, readback queries, excluded expressions and signal payloads (**automated**).
- **Phase 2 — Reuse selected fields:** apply the local fix; rerun regressions and partial-save/expression/generated/deferred suites on both backends, formatting/lint/diff checks (**automated**); review preserved contracts and unrelated work (**manual**).

P's progress checklist marks automated criteria complete; human diff review remains valieated.

## 5. Domain-Driven Design — L5

**Ubiquitous Language:** a **Position** records an investment; **Reason** is optional author prose; **Reason category** groups comparable reasoning; **Confrontation** presents prior same-category investments/outcomes; **Wallet** is a fixed-currency grouping, not a broker account. [D, Ubiquitous Language; G]

**Model/code discrepancies:** reason locking is declared but unenforced; category retirement has storage but lacks the removal/history-marker workflow; confrontation can be bypassed, including when history loading fails. D records a conflict between the newer PRD and an older accepted ungated-save decision. [D, D1/D3/D5]

**Invariant #1:** present complete, non-deleted same-category history with reasons and dated outcomes or explicit missing prices before recording. I prioritizes this over reason locking because it defines the primary success criterion and has a concrete fail-open workflow. Its **proposed**, database-resident aggregate is `InvestmentRecording`: prepare a bound review, then explicitly confirm and atomically record it. This tightens earlier behavior; it is not an implemented guarantee or proof of human attention. [I §§1–4]

**ACL:** A selects **Supabase JS SDK plus its SSR companion**: client types enter services, SDK `User` defines request identity, and generated database rows shape public DTOs. Its summary establishes leakage across **three logical areas: delivery, application services and shared contracts/types**; Appendix A inventories **59 source/script/test files**, not 59 runtime imports. The proposed `src/lib/acl/diary-store/` owns SDK construction, codecs, queries and error translation; narrow ports and project-owned types protect consumers. This is a plan, not an implemented boundary; replacement covers the client SDK against the existing backend, not backend portability. [A §§2–5, Appendix A, Summary]

## 6. Decisions That Are Mine to Make

Django - L4 selects C1 and it seems really a bug. There are not any proofs that making additional query for update python objects make sense. C2 is also interesting, but I prefer to fix number of not expected queries to db than diversity of return types. Returned types seems a small problem as it is only static analyse. Number of queries can impact on production speed.

Investments-diary - I totally agree that language used in application can be problematic. Wallet usually is used in one stock broker. Here is just label, which is not needed at all. I think it is more important to decide on language that is not confusing, what is required and what for. This is first step before designe borders in code.