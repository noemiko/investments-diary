---
title: "Anti-corruption layer for diary persistence and identity"
created: 2026-11-06
type: refactor-plan
---

# Discovery → identification → classification → diagnosis → design

This is a refactoring plan only; production code was not changed. The selected application is **Investments Diary**. The workspace also contains the unrelated course CLI (`10x-cli/package.json:2`) and root shaping notes about an advertising platform (`shape-notes.md:223`); their requirements must not be attributed to the diary. All paths below are workspace-relative, including the `investments-diary/` prefix. Proposed paths and pseudocode describe future work, not existing implementations. This document is saved at the exact workspace-relative path requested.

## 0. Context and dependency discovery

The diary records investments and confronts the author with prior reasoning, with privacy and exact financial values central to its behavior (`investments-diary/context/foundation/prd.md:23`, `investments-diary/src/lib/result.ts:23`). Its documented stack intentionally favors an integrated starter and database-to-interface typing (`investments-diary/context/foundation/tech-stack.md:24`, `investments-diary/context/foundation/tech-stack.md:31`). The README is partly stale: its statement that no domain migrations are required (`investments-diary/README.md:113`) is contradicted by current service access to domain tables (`investments-diary/src/lib/services/positions.ts:65`). Treat executable code and current PRD requirements as stronger evidence of current behavior.

Runtime: Node 24, Astro 7 SSR, React 19 islands, TypeScript 6, Tailwind 4, Vercel, PostgreSQL/Supabase auth. Manifest declarations, rather than assumptions about installed latest versions, are the baseline (`investments-diary/package.json:6`, `investments-diary/package.json:36`). Development tools include Vitest, Playwright, Stryker, ESLint, Prettier, Husky and the Supabase CLI (`investments-diary/package.json:60`). Complete direct dependency inventory:

- dependencies: `@astrojs/check@^0.9.10`, `@astrojs/react@^6.0.5`, `@astrojs/sitemap@^3.7.4`, `@astrojs/vercel@^11.0.11`, `@eslint/config-helpers@^0.7.0`, `@radix-ui/react-slot@^1.1.2`, `@sentry/astro@11.8.0`, `@supabase/ssr@0.12.7`, `@supabase/supabase-js@^2.99.1`, `@tailwindcss/vite@^4.2.4`, `@types/react@^19.2.14`, `@types/react-dom@^19.2.3`, `astro@^7.3.2`, `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `lucide-react@^1.14.0`, `react@^19.2.6`, `react-dom@^19.2.6`, `tailwind-merge@^3.5.0`, `tailwindcss@^4.2.4`, `tw-animate-css@^1.4.0`, `yahoo-finance2@4.0.5`
- devDependencies: `@eslint/compat@^2.1.1`, `@eslint/js@^10.0.1`, `@playwright/test@^1.64.1`, `@stryker-mutator/core@^10.0.0`, `@stryker-mutator/vitest-runner@^10.0.0`, `eslint@^10.10.0`, `eslint-config-prettier@^10.1.8`, `eslint-plugin-astro@^3.1.0`, `eslint-plugin-jsx-a11y@6.10.2`, `eslint-plugin-prettier@^5.5.6`, `eslint-plugin-react@^7.37.5`, `eslint-plugin-react-hooks@^7.1.1`, `husky@9.1.7`, `lint-staged@^16.3.3`, `prettier@^3.9.6`, `prettier-plugin-astro@^1.0.0`, `prettier-plugin-tailwindcss@^0.8.1`, `supabase@^2.23.4`, `typescript@^6.0.3`, `typescript-eslint@^8.70.0`, `vitest@^5.0.5`

Observed layers:

- Delivery/composition: Astro pages, auth endpoints and middleware; request cookies and redirects belong here (`investments-diary/src/middleware.ts:9`, `investments-diary/src/pages/api/auth/signin.ts:10`).
- Application orchestration mixed with persistence: `src/lib/services`, with SQL projections, SDK calls and business outcomes together (`investments-diary/src/lib/services/positions.ts:53`, `investments-diary/src/lib/services/positions.ts:74`).
- Domain calculations and shared contracts: `src/lib/result.ts`, `wallet.ts`, decimal helpers and `src/types.ts`; shared contracts currently derive from generated rows (`investments-diary/src/types.ts:1`).
- Infrastructure: SSR client factory, market-data adapter, observability and SQL migrations (`investments-diary/src/lib/supabase.ts:18`, `investments-diary/src/lib/market-data/yahoo.ts:1`).
- Presentation: Astro components and React islands, with pure domain result helpers (`investments-diary/src/components/positions/ConfrontationPanel.tsx:54`). These are logical layers, not currently enforced package boundaries.

## 1–2. Candidate leaks and selection

| Candidate | Impact and replacement cost | Architectural intent | Rank |
| --- | --- | --- | --- |
| Supabase JS SDK plus SSR companion | Request composition, auth identity, application services, repositories, observability, generated shared types and tests. High risk: RLS identity, numeric decoding, query result semantics and error translation are distributed. Appendix A enumerates every direct source/script reference plus structurally coupled helpers. | No explicit replaceability promise found in diary README, PRD, tech-stack or shape notes. Database-to-interface typing is explicitly favored. Coupling is real, but is not a proven violation of a documented replacement promise. | **1** |
| Yahoo SDK/provider | SDK import is already isolated, but service defaults/types depend on its concrete factory, refresh policy imports Yahoo limits, and shared quote contract fixes provider to Yahoo. Medium SDK replacement cost; higher provider replacement cost because provider identity is also persisted. Appendix B inventories code knowledge. | Adapter explicitly says it has no browser consumers (`investments-diary/src/lib/market-data/yahoo.ts:14`). That statement is not a promise that all provider knowledge is isolated. | 2 |
| Sentry Astro SDK | Observability modules, middleware, server/client initialization and build integration. Medium integration replacement cost, low direct domain intrusion. Appendix C inventories all SDK references. | Client and server telemetry initialization is deliberate; sharing a telemetry SDK across those runtimes is not itself a domain violation. | 3 |

React, Astro, Tailwind and UI packages are delivery dependencies; repeated imports within their intended presentation/framework layer do not establish domain leakage. Supabase is selected for the breadth and security sensitivity of coupling, not merely its import count. Counts in the appendices distinguish direct textual knowledge from transitive schema knowledge; no claim is made that every package mention is a runtime import.

## 3. Diagnosis and duplicated logic

The factory is an encapsulated constructor, not an ACL: it returns the complete SDK (`investments-diary/src/lib/supabase.ts:13`). `Client = ReturnType<typeof createClient>` then enters service signatures (`investments-diary/src/lib/services/positions.ts:24`, `investments-diary/src/lib/services/positions.ts:74`, `investments-diary/src/lib/services/wallets.ts:15`). Auth SDK `User` is the global request identity (`investments-diary/src/env.d.ts:3`), and generated database rows define application contracts (`investments-diary/src/types.ts:3`). Consequently SDK/schema changes reach delivery and shared types even though most consumers do not import the external package directly.

| Existing locations with repeated dependency-related logic | Before | After |
| --- | --- | --- |
| `investments-diary/src/lib/services/positions.ts:79`, `investments-diary/src/lib/services/positions.ts:104`, `investments-diary/src/lib/services/positions.ts:125`, `investments-diary/src/lib/services/wallets.ts:71` | Repeated decimal casts, effective-price projection, state filters and SDK type overrides | One adapter-owned projection definition; position mapper calls the same domain constructor on every read; typed repository operations replace query builders |
| `investments-diary/src/lib/services/positions.ts:88`, `investments-diary/src/lib/services/positions.ts:133`, `investments-diary/src/lib/services/positions.ts:169` | Rebuild joined category/wallet names in several reads | Named list/detail/deleted mappers in ACL; no nested SDK relation shapes escape |
| `investments-diary/src/lib/services/wallets.ts:37`, `investments-diary/src/lib/services/wallets.ts:55`, `investments-diary/src/lib/services/wallets.ts:61` | Duplicate wallet selection and decimal/currency reconstruction | One wallet projection and mapper; domain decimal/currency validation reused |
| `investments-diary/src/lib/services/positions.ts:53`, `investments-diary/src/lib/services/positions.ts:152`, `investments-diary/src/lib/services/wallets.ts:22`, `investments-diary/src/lib/services/wallets.ts:109` | SDK error shape and SQLSTATE interpretation mixed into services; wallets import position-service constants | Adapter translates failures by operation into stable domain outcomes; internal shared SQLSTATE decoder |
| `investments-diary/src/lib/services/positions.ts:157`, `investments-diary/src/lib/services/positions.ts:175`, `investments-diary/src/lib/services/wallets.ts:110` | Repeated zero-affected-row semantics | Internal mutation outcome decoder, preserving missing/foreign/deleted indistinguishability |
| `investments-diary/src/lib/services/market-price-repository.ts:55`, `investments-diary/src/lib/services/market-target-repository.ts:39`, `investments-diary/src/lib/services/effective-price.ts:106`, `investments-diary/src/lib/services/effective-price.ts:123` | Repeated persistence listing reconstruction | ACL listing mapper owns field renaming; shared domain listing constructor validates the normalized shape |
| Appendix A request handlers and middleware, e.g. `investments-diary/src/pages/dashboard/new.astro:38`, `investments-diary/src/middleware.ts:13`, `investments-diary/src/lib/market-data/endpoint.ts:58` | Construct/pass an SDK client at each boundary | Resolve request-scoped ports from one composition entry point; no client escapes |

Existing centralization must be retained: exact decimal decoding is already centralized (`investments-diary/src/lib/services/decimal.ts:4`), and effective-price composition already has one implementation (`investments-diary/src/lib/services/effective-price.ts:44`). The problem is distributed invocation/projection and boundary placement, not multiple independent arithmetic engines.

Dangerous paths: `src/types.ts → generated database rows → domain-facing DTOs` is a type-level leak; `service → ReturnType<factory>` is an infrastructure-level leak. A future island importing a service could drag server infrastructure into its graph. **No current browser Supabase SDK call or server SDK bundle inclusion was established**: current React components use domain DTOs, and Astro frontmatter executes server-side. Type-only imports do not create runtime bundles. Yahoo has an explicit runtime browser guard, but a runtime throw is not proof of build-time exclusion (`investments-diary/src/lib/market-data/yahoo.ts:15`). Sentry's client initialization is intentional. Build-graph checks are therefore required rather than asserting a present credential leak.

## 4. ACL and domain design

Create `investments-diary/src/lib/acl/diary-store/` for all SDK construction, query syntax, generated database/API types, persistence mappings and vendor error classification. Keep pure domain objects under `src/lib/domain/` and narrow interfaces under `src/lib/ports/`; continue exporting stable public DTOs from `src/types.ts` per project convention. Services receive ports; delivery resolves them through a vendor-neutral `src/lib/application/request-context.ts`. Dependency direction is delivery → application → ports/domain, and ACL → ports/domain. Domain never imports ACL.

**Authoritative domain object: `RecordedPosition`**, discovered from existing position projections, with a `ValuationSnapshot` value object. It owns normalized position/valuation structure and domain operations; it does not become a wrapper exposing the SDK. Exactly one ACL codec owns persistence/library representation. Putting SDK constructors or database columns inside the pure entity would recreate the violation this plan removes. Together the domain constructor and codec form a single authoritative translation route, with each representation owned once.

```ts
// Proposed signatures; DecimalText and ISO date/time are validated domain strings.
class RecordedPosition {
  private constructor(private readonly facts: PositionFacts,
                      private readonly valuation: ValuationSnapshot) {}
  static restore(facts: PositionFacts, valuation: ValuationSnapshot): RecordedPosition;
  result(): PositionResultValue | null; // delegate existing exact arithmetic
  toListItem(names: PositionNames): PositionListItem;
  toDetail(names: PositionNames): PositionDetail;
  toConfrontation(): ConfrontationPosition;
}
class ValuationSnapshot {
  static restore(data: ValuationData, now: Instant): ValuationSnapshot;
  effectivePrice(): DecimalText | null;
  toDTO(): PositionValuation;
}
// ACL-private: sole owner of row/SDK structure, never exported through ports.
class PositionCodec {
  fromPersistence(row: unknown, now: Instant): RecordedPosition;
  toPersistence(input: NewPositionInput, author: AuthorId): PositionInsert;
  fromLibrary(result: QueryResult<unknown>): Result<RecordedPosition | null, StoreFailure>;
  toLibrary(input: NewPositionInput, author: AuthorId): PositionInsert;
}
// Pseudocode:
// fromLibrary: translate vendor failure; validate result shape; fromPersistence(data)
// fromPersistence: validate text decimals; map joins/valuation; RecordedPosition.restore(...)
// toLibrary: toPersistence(...); caller adapter passes insert payload to SDK
// Never infer authorization from a posted author; use verified request context.
```

`PositionFacts`, `PositionNames`, `ValuationData`, input types and DTOs are explicit project-owned interfaces, not `Pick<Tables<...>>`. Persistence insert shapes stay private to ACL. `toPersistence` maps commands, not whole restored entities: inserting a read projection would risk overwriting manual facts with effective prices. Domain result operations reuse `positionResult`, preserving zero-price sales and missing quantities. SQL effective-price selection remains authoritative for persisted precedence; the VO consumes that selection and does not implement a competing price-choice algorithm.

```ts
interface PositionReadPort {
  list(walletId?: WalletId): Promise<PositionListItem[]>;
  get(id: PositionId): Promise<PositionDetail | null>;
  confrontation(): Promise<ConfrontationPosition[]>;
  deleted(): Promise<DeletedPositionItem[]>;
  categories(): Promise<ReasonCategory[]>;
}
interface PositionWritePort {
  record(input: NewPositionInput): Promise<CreatePositionResult>;
  updatePrice(id: PositionId, input: PriceUpdateInput): Promise<UpdatePriceResult>;
  close(id: PositionId, input: ClosePositionInput): Promise<ClosePositionResult>;
  remove(id: PositionId): Promise<SoftDeleteResult>;
  restore(id: PositionId): Promise<SoftDeleteResult>;
  move(id: PositionId, input: MovePositionInput): Promise<MovePositionResult>;
}
interface IdentityPort {
  currentAuthor(): Promise<Result<Author | null, IdentityFailure>>;
  signIn(email: string, password: string): Promise<Result<Author, IdentityFailure>>;
  signOut(): Promise<Result<void, IdentityFailure>>;
  exchangeCode(code: string): Promise<Result<void, IdentityFailure>>;
}
// Author = { id: AuthorId }; extend only for fields actually consumed.
class SdkPositionAdapter implements PositionReadPort, PositionWritePort {
  // private request-scoped client; private codec; actor bound by composition
  async get(id) {
    result = await client.from(view).select(privateProjection).eq('id', id)
                         .is('deleted_at', null).maybeSingle();
    entity = codec.fromLibrary(result);
    return entity === null ? null : entity.toDetail(mappedNames);
  }
}
```

Result types above are existing outcome concepts or proposed domain-owned equivalents; do not export query errors, SDK users, headers, query builders, relation rows or generic CRUD methods. Split wallet reads/writes and snapshot reads into equally narrow ports using existing function signatures with the client/userId parameters removed. Extract the existing `PriceRepository` interface (`investments-diary/src/lib/services/market-price-repository.ts:20`) from its implementation; similarly extract target and selection persistence operations, preserving claim/finish atomic RPCs. Market orchestration continues to control explicit downloads; the storage port must not call the price provider. Do not replace atomic RPCs with client-side read/modify/write sequences.

All SDK errors are translated in ACL, including auth classification currently in `investments-diary/src/lib/observability/auth.ts:38`. Observability receives a sanitized application failure plus internal cause through its existing reporting boundary. Credentials and cookies stay private; request context returns only bound ports and an application identity. A generic `execute(table, filters)` port is expressly rejected because it would export persistence structure under another name.

## 5. Contract decisions and isolation proof

Official documentation was consulted directly; a few reference URLs failed, so those points were checked against installed source rather than inferred from search snippets. Decisions:

| Question | Resolved contract and encoding location |
| --- | --- |
| Does maybeSingle mean any failure is absence? | No: it accepts zero or one row; excess rows are an error. Encode null vs unavailable/corrupt data in ACL result decoder; never turn all failures into 404. [Official reference](https://supabase.com/docs/reference/javascript/maybesingle). |
| Are range bounds inclusive? | Yes, zero-based and inclusive, with deterministic ordering needed. Keep pagination in ACL, advance by received rows, and continue until an empty page even when server caps are lower. Preserve behavior of `investments-diary/src/lib/services/read-all.ts:13`. [Official reference](https://supabase.com/docs/reference/javascript/range). |
| Can server identity trust cookie session data? | Retain current server-verified getUser behavior; do not replace it with trusting getSession's embedded user. Official SSR guidance distinguishes verified identity from locally loaded session data. Encode in identity adapter, not route handlers. [Official SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?environment=client-component); installed warning: `investments-diary/node_modules/@supabase/auth-js/src/GoTrueClient.ts:2811`. |
| Who owns refresh cookie propagation? | SSR adapter implements both cookie read/write callbacks and preserves all cookie options/deletions. Request composition supplies a framework cookie bridge. Never cache the authenticated client globally. [Version 0.12.7 API](https://supabase.github.io/ssr/functions/createServerClient.html). |
| Does a type override validate decimal data? | No runtime decoder is provided by a TypeScript return-type override. Installed implementation is authoritative (`investments-diary/node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:602`). Keep runtime text validation and explicit ::text projections in codec/adapter; reject JSON numbers rather than repair lost precision (`investments-diary/src/lib/decimal.ts:44`). |
| What does zero affected rows mean? | Preserve existing app contract: missing, foreign, deleted or state-filtered records cannot be distinguished (`investments-diary/src/lib/services/positions.ts:156`). Mutation decoder owns it; HTTP only maps the normalized outcome. |

Replacement exercise: substitute a different transport implementation against the **same existing Supabase Auth/PostgREST/PostgreSQL backend** and run identical port contract tests. Only `src/lib/acl/diary-store/**` changes executable transport code. Package declarations and lockfile necessarily change as dependency bookkeeping. Explicitly unchanged: database tables, migrations, RLS policies, views, atomic RPC definitions, HTTP paths/statuses/response fields, `src/types.ts`, domain arithmetic, services, Astro views and React components. Backend replacement is a different project: auth users, RLS/JWT assumptions, SQL functions and scheduling are backend commitments and cannot honestly be promised adapter-only portability.

UI example: adapter returns `{ id, instrument, buy_price: "50", quantity: "10", current_price: "60", price_date, category_name, wallet_name, valuation }` using the existing stable DTO shape. Components receive validated decimals and selected valuation, never `{data,error}`, SDK users or joined rows. `ConfrontationPanel` can continue `describeResult(position)` (`investments-diary/src/components/positions/ConfrontationPanel.tsx:55`); rendering formatting remains a presentation concern. No serialization of class instances or BigInt arithmetic results is required across hydration boundaries. Initial refactoring changes server composition, not the UI wire schema.

## 6. Phased refactoring and verification

1. **Characterize existing contracts.** Add port contract fixtures for list/detail/confrontation/wallet views, null vs failure, exact decimals, closed zero sale, missing quantity, cached price after failed refresh, manual-price precedence and pagination over a lower server cap. Capture native auth redirects and current HTTP statuses. Follow co-located Vitest and independent expected values (`investments-diary/context/foundation/test-plan.md:157`, `investments-diary/context/foundation/test-plan.md:161`). This document does not execute these tests.
2. **Create project-owned contracts and domain constructors.** Replace row-derived public types with structurally identical explicit interfaces. Add RecordedPosition/ValuationSnapshot restoration using existing financial helpers. Add ports, including extracted market repository interfaces; compile all consumers before moving implementation. Coordinate with existing aggregate refactoring plans rather than introducing competing record/save workflows.
3. **Move persistence behind ACL, one read/write slice at a time.** Move generated types, API write overrides, projections, pagination, codecs, SDK error translation and repository implementations. Migrate all duplicated locations in the diagnosis table. Preserve the deployed database schema and atomic operations; no migration is expected for this boundary-only change. Run the same adapter contract suite through the real local authenticated client, including two owners.
4. **Bind identity and ports once per request.** Replace every request-level client constructor and every client-typed service argument in Appendix A. Middleware publishes application Author only; auth handlers call IdentityPort and retain native POST/redirect conventions. Move SDK-specific auth tests inside ACL; application/UI tests fake ports. Move script SDK setup behind ACL support entry points; keep administrative credentials separate from ordinary author-bound ports.
5. **Prove replacement and bundle isolation.** Run contract tests against a second in-memory port implementation to prove consumer independence; this proves interface isolation, not backend interchangeability. Inspect production client dependency graphs for storage SDK/server environment modules, and fail browser imports of ACL through lint/build rules. Imports of vendor types outside ACL must also fail. Remove old wrappers and compatibility exports, then perform the inventory/grep gates below.
6. **Run project gates and update architectural guidance.** Use local database only, run `npm run verify`, `npx astro check`, `npm run build`, relevant decimal/contract/recovery database scripts and `npm run smoke` against the running local app. The existing verification skill owns execution order in an implementation task (`investments-diary/AGENTS.md:59`); no production deploy is included. If behavior-breaking verification is required by the test convention, it belongs to that later implementation task, with changes restored. Record proof and limitations before retiring the change.

### Grep success criterion

From `investments-diary/`, this source/script gate must return only paths within ACL:

```sh
grep -RInE '@supabase/(supabase-js|ssr)' src scripts tests --include='*.ts' --include='*.tsx' --include='*.astro' --include='*.mjs' --include='*.js'
```

Also enforce no imports of generated DB types, ACL internals, query builders or `ReturnType<typeof createClient>` outside ACL; a package-name grep alone misses transitive leaks. Domain/UI may import only public ports/domain/application composition entry points. Run a separate client-bundle dependency graph check; minification can erase package names.

An unrestricted repository grep cannot literally return only ACL paths: package.json, lockfiles, this plan and historical architecture notes necessarily mention the dependency. Preserve those truthful records. Define the executable-code scan above as the enforceable gate, with manifest/lock/docs explicitly outside its scope; do not claim the unrestricted command can pass. After migration **every Appendix A source/script file outside ACL loses SDK knowledge**: pure application tests use ports, SDK integration tests move into ACL, and SDK-backed scripts call neutral support functions. Generated schema/API files and mapper implementations move into ACL and remain knowledgeable there. Operational SQL/CLI/config references are backend knowledge, not JS SDK leakage.

## Appendix A. Complete current storage dependency inventory

Inventory includes all first-party source, scripts, tests and executable configuration with direct package/client-wrapper/generated-schema references, plus structural transport helpers. One row per file; the first verified matching line is cited. This is a static source inventory, excluding node_modules, build output, manifests/lockfiles, prose and backend SQL/CLI configuration. The manifest lists the SDK explicitly (`investments-diary/package.json:44`, `investments-diary/package.json:45`); package-lock.json also necessarily records it. The same scope is used for the other candidates. “Remove” means rewrite to ports/domain-only knowledge; “move” means implementation/test moves under ACL, leaving any public facade neutral.

59 files.

| Verified file:line | Disposition after refactoring |
| --- | --- |
| `investments-diary/scripts/demo/__tests__/demo-data.test.mjs:5` | Move implementation/test into ACL |
| `investments-diary/scripts/demo/seed-demo.mjs:2` | Move implementation/test into ACL |
| `investments-diary/scripts/observability/sentry-probe.mjs:135` | Move implementation/test into ACL |
| `investments-diary/src/components/positions/new-position.test.ts:10` | Remove vendor knowledge; use ports |
| `investments-diary/src/components/positions/result-surfaces.test.ts:18` | Remove vendor knowledge; use ports |
| `investments-diary/src/components/wallets/wallet-currency.test.ts:6` | Remove vendor knowledge; use ports |
| `investments-diary/src/db/api.types.ts:1` | Move implementation/test into ACL |
| `investments-diary/src/db/database.types.ts:1` | Move implementation/test into ACL |
| `investments-diary/src/env.d.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/market-data/endpoint.test.ts:8` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/market-data/endpoint.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/market-data/new-search-endpoint.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/market-data/trigger-boundaries.test.ts:6` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/observability/auth.test.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/observability/auth.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/observability/middleware.test.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/observability/read-boundaries.test.ts:16` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/observability/write-failures.test.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/close-position.test.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/decimal.test.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/decimal.ts:4` | Move implementation/test into ACL |
| `investments-diary/src/lib/services/effective-price.ts:5` | Move implementation/test into ACL |
| `investments-diary/src/lib/services/market-price-repository.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/market-prices.test.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/market-prices.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/market-selections.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/market-target-repository.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/move-position-endpoint.test.ts:5` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/positions.ts:7` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/read-all.ts:9` | Move implementation/test into ACL |
| `investments-diary/src/lib/services/read-contracts.test.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/wallet-reads.test.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/wallet-snapshots.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/services/wallets.ts:8` | Remove vendor knowledge; use ports |
| `investments-diary/src/lib/supabase.ts:1` | Move implementation/test into ACL |
| `investments-diary/src/middleware.ts:5` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/api/auth/signin.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/api/auth/signout.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/auth/callback.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/deleted.astro:7` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/new.astro:11` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/positions/[id]/delete.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/positions/[id]/move.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/positions/[id]/restore.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/positions/[id].astro:16` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/wallets/[id].astro:17` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/wallets/index.astro:8` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard/wallets/new.astro:8` | Remove vendor knowledge; use ports |
| `investments-diary/src/pages/dashboard.astro:11` | Remove vendor knowledge; use ports |
| `investments-diary/src/types.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/tests/database/decimal.test.ts:7` | Remove vendor knowledge; use ports |
| `investments-diary/tests/database/effective-valuations.test.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/tests/database/market-prices.test.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/tests/database/market-selections.test.ts:2` | Remove vendor knowledge; use ports |
| `investments-diary/tests/database/selection-fixture.ts:1` | Remove vendor knowledge; use ports |
| `investments-diary/tests/database/wallet-snapshots.test.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/tests/e2e/helpers/investment-data.ts:3` | Remove vendor knowledge; use ports |
| `investments-diary/tests/e2e/market-price-controls.spec.ts:4` | Remove vendor knowledge; use ports |
| `investments-diary/tests/e2e/wallet-dashboard.spec.ts:5` | Remove vendor knowledge; use ports |

## Appendix B. Complete current market-provider code knowledge

This deliberately includes provider identity literals and concrete adapter factory imports, not just the external package import. Persisted Yahoo identities in SQL fixtures and shared contracts are provider coupling, not raw SDK objects. SDK replacement can preserve these identities; provider replacement cannot assume them away.

23 files.

| Verified file:line | Additional matching line numbers (including first) |
| --- | --- |
| `investments-diary/scripts/demo/lib/demo-data.mjs:7` | 7 / 46 |
| `investments-diary/scripts/testing/database/contract/access.mjs:34` | 34 / 38 / 64 / 68 |
| `investments-diary/scripts/testing/database/test-market-price-recovery.mjs:57` | 57 |
| `investments-diary/scripts/testing/market-data-probe.mjs:1` | 1 / 10 / 53 / 77 |
| `investments-diary/scripts/testing/smoke.mjs:20` | 20 / 90 |
| `investments-diary/src/components/positions/new-position.test.ts:12` | 12 / 24 / 97 / 116 / 129 / 147 / 161 / 188 / 236 |
| `investments-diary/src/lib/market-data/refresh-policy.ts:2` | 2 / 11 / 26 / 48 |
| `investments-diary/src/lib/market-data/trigger-boundaries.test.ts:5` | 5 / 8 / 29 |
| `investments-diary/src/lib/market-data/yahoo.test.ts:3` | 3 / 45 / 50 / 56 / 185 / 192 / 198 / 247 / 266 / 268 / 276 / 295 |
| `investments-diary/src/lib/market-data/yahoo.ts:1` | 1 / 17 / 18 / 22 / 32 / 33 / 86 / 107 / 110 / 181 / 243 / 258 |
| `investments-diary/src/lib/services/market-prices.test.ts:37` | 37 |
| `investments-diary/src/lib/services/market-prices.ts:2` | 2 / 15 / 37 / 73 |
| `investments-diary/src/lib/services/market-selections.ts:2` | 2 / 73 / 98 / 114 |
| `investments-diary/src/lib/services/market-target-repository.ts:96` | 96 |
| `investments-diary/src/types.ts:193` | 193 |
| `investments-diary/tests/database/decimal.test.ts:48` | 48 / 88 |
| `investments-diary/tests/database/effective-valuations.test.ts:61` | 61 |
| `investments-diary/tests/database/market-prices.test.ts:44` | 44 |
| `investments-diary/tests/database/market-selections.test.ts:55` | 55 / 256 |
| `investments-diary/tests/database/selection-fixture.ts:7` | 7 / 20 / 32 |
| `investments-diary/tests/e2e/helpers/investment-data.ts:89` | 89 |
| `investments-diary/tests/e2e/investment-persists.spec.ts:29` | 29 / 79 |
| `investments-diary/tests/e2e/market-price-controls.spec.ts:56` | 56 / 80 |

## Appendix C. Complete current telemetry SDK knowledge

9 files.

| Verified file:line | Additional matching line numbers (including first) |
| --- | --- |
| `investments-diary/astro.config.mjs:7` | 7 |
| `investments-diary/sentry.client.config.ts:1` | 1 |
| `investments-diary/sentry.server.config.ts:1` | 1 |
| `investments-diary/src/lib/observability/middleware.test.ts:3` | 3 |
| `investments-diary/src/lib/observability/privacy.test.ts:2` | 2 |
| `investments-diary/src/lib/observability/privacy.ts:1` | 1 |
| `investments-diary/src/lib/observability/reporter.test.ts:2` | 2 / 5 / 6 |
| `investments-diary/src/lib/observability/reporter.ts:1` | 1 |
| `investments-diary/src/middleware.ts:2` | 2 |

## Summary

Supabase is the highest-impact dependency leak because its client, identity and database-shaped contracts cross delivery, services and shared types. No diary document inspected explicitly promises that Supabase can be replaced, so this is an observed boundary weakness rather than a fabricated documentation breach. Yahoo already has useful normalization, although concrete factory and provider-policy coupling remain. The proposed ACL owns SDK construction, persistence codecs, query projections, pagination and failure translation. RecordedPosition and ValuationSnapshot own normalized domain structure while narrow ports protect application and presentation code. The replacement guarantee covers the client SDK against the existing backend and preserves tables, API contracts and UI components. Phased contract, ownership, precision and bundle checks establish isolation without changing production code in this task.
