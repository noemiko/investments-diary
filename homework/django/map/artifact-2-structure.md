# Django structure and dependencies — session summary

Prepared: **3 November 2026**. The report is in English, consistent with the territory-map artifact and the session's analysis.

## Repository and scope

- Repository: `django/django`.
- Checkout: `django-10x/django`.
- Analyzed HEAD: `b501b8493f31cf8cba31211d59b3b78642b8cb02` (the same HEAD as the territory map).
- Activity reference: [artifact-1-territory.md](artifact-1-territory.md).
- Dependency tool: **Tach 0.35.3**. Rendering tool: **Graphviz 14.1.4**.
- Implementation priorities were the four implementation areas in the territory map's main annual top-ten ranking: `django/db/models` (**126 commits**), `django/contrib/admin` (**86**), `django/utils` (**60**), and `django/db/backends` (**55**). This was not a review of every implementation area listed elsewhere in that map.

## Method and limitations

Ran `tach map -o /tmp/django-tach-audit/dependencies.json` from the checkout and preserved its output in the artifacts directory below. The existing `tach.toml` declares a single `django` module and source root `.`; its exclusions cover tests, docs, virtual environments, egg-info, and bytecode directories. The analysis used the file-level map rather than treating that single configured module as sufficient architectural granularity.

The saved map has **637 source keys, 700 distinct source/target nodes, and 3,328 directed edges**. Some target nodes have no source key; all 700 paths exist in this checkout. Directory-specific renders explicitly enumerate existing Python files and keep only mapped edges between them.

Cycle discovery used graph traversal over Tach output, followed by Python AST inspection to identify concrete import statements and whether imports occur at module level or inside functions/methods. Every directed edge in the 17 selected two-file cycles was verified against the raw Tach JSON and matched to source imports. Additional Tach edges, including package initialization/re-export relationships, were not automatically treated as direct import statements.

The selected cycles are a prioritized sample, **not an exhaustive enumeration of all simple cycles**, and no SCC size is presented as a cycle length. Each reported loop contains exactly two distinct files and both directed edges; unrelated or longer paths do not enlarge it.

- **Runtime, module-level:** imports can make initialization depend on definition order.
- **Runtime, local/deferred:** imports inside functions or methods still execute at runtime. Their placement often avoids an initialization conflict. A local import may nevertheless be called during startup, so static placement does not prove execution timing.
- **Types/build:** no `TYPE_CHECKING` occurrences were found in `django`, and no build/dist nodes were present in the saved Tach map. None of the selected cycles was classified as type-only or build-only. Importing a class also used in annotations does not itself make an import type-only.
- Static analysis does not fully capture dynamic imports, settings-driven loading, app-registry behavior, or runtime execution paths.
- No backend import smoke tests or test suites were run. A cycle is not proof of an existing startup failure, defect, or need for immediate refactoring.
- Territory-map activity and repair counts indicate review priorities; they do not prove that a particular cycle caused historical bugs.

## Main findings

1. Backend cycles deserve early attention because their imports run at module level. PostgreSQL, SQLite, and Oracle currently rely on symbols being defined before importing a dependent module.
2. ORM and admin also have genuine two-file runtime loops. Many return edges are local imports; moving them to the top of a file can change working initialization behavior.
3. Public API initializers re-export implementations that sometimes import back through the same package. These can be intentional compatibility arrangements, but import order is part of their behavior.
4. The useful unit of review is the smallest concrete loop and the symbols exchanged across it, not a large cluster of transitively connected modules.
5. Thin public facades can have high fan-in, while dynamic compiler dispatch can hide the importance of deeper modules. Read the role and contract tables together with the graph.
6. The most useful next checks are targeted regression tests and initialization checks around an intended change, rather than an immediate repository-wide removal of circular dependencies.

## Tooling, package management, and path resolution

| Check | Verified configuration | Consequence for this analysis |
|---|---|---|
| Python packaging | [pyproject.toml](../../pyproject.toml) uses `setuptools.build_meta`, package discovery `django*`, and Python >=3.12. CI installs with `python -m pip install -r tests/requirements/py3.txt -e .`. | Use the Python package tree and editable-install layout; no JavaScript alias configuration is needed for Django's Python code. |
| Python tooling | [tox.ini](../../tox.ini) runs `tests/runtests.py`, linting, docs checks, and optional JavaScript tests. Test dependencies live under `tests/requirements/`. | Test targets must be chosen separately from the production-only dependency map. |
| JavaScript tooling | [package.json](../../package.json) uses npm scripts `test` (`grunt test --verbose`) and `biome` (`biome check`); [Gruntfile.js](../../Gruntfile.js) runs QUnit. | This is auxiliary JavaScript tooling, not a reason to use dependency-cruiser for Python. |
| Workspace and lockfiles | No tracked npm workspace definition, `.code-workspace`, Python workspace-manager configuration, or conventional package-manager lockfile was found. | The checked configuration describes one distributable Python package, not a workspace of separately resolved applications. |
| Path resolution | Tach sets `source_roots = ["."]`; isort identifies `django` as first-party. Tox passes `PYTHONPATH`; some test/maintenance scripts adjust `sys.path`. No TypeScript-style path alias mapping was found. | Re-exports and Python import mechanics matter. Test-only path adjustments are outside the saved graph's scope. |
| Dependency tooling | [tach.toml](../../tach.toml) exists locally, but is untracked. No Tach, pydeps, pyreverse, or dependency-cruiser integration was found in the inspected CI/tox/package scripts. Graphviz is installed locally. | Tach is suitable for file-level exploration; it is not currently an enforced upstream architectural policy. One configured `django` module does not establish layer boundaries. |

`django/db/migrations/graph.py` models migration ordering; it is not a source-code dependency graph generator.

## Contracts used across layers

These are behavioral interfaces verified in source, not all ordinary import edges. Relative source links below refer to the analyzed checkout. An arrow means the left-hand component depends on the right-hand component's behavior.

| Contract / direction | Definition and implementation | Verified consumer | Change risk and targeted validation |
|---|---|---|---|
| Connection selection → backend factory | [ConnectionHandler.create_connection](../../django/db/utils.py) at line 194 reads `ENGINE`; `load_backend()` at line 106 imports `<ENGINE>.base` and obtains `DatabaseWrapper`. | `django/db/__init__.py` exposes `connections`; `connections[alias]` selects a configured wrapper. | Module moves or wrapper-constructor changes can break database setup without a matching static import edge. Check configured built-in backends and custom backend compatibility. |
| ORM → backend operations and compiler selection | [Query.get_compiler](../../django/db/models/sql/query.py) at line 369 calls `connection.ops.compiler(self.compiler)`. [BaseDatabaseOperations.compiler](../../django/db/backends/base/operations.py) at line 406 imports `compiler_module` dynamically and retrieves the named class. PostgreSQL overrides the module string in `postgresql/operations.py:28`. | Query execution and nested SQL compilation. | Preserve compiler names, constructor arguments, and SQL/parameter behavior; validate representative QuerySets on the affected backend. |
| ORM SQL compiler → backend capabilities | [BaseDatabaseFeatures](../../django/db/backends/base/features.py) defines defaults; backend-specific feature subclasses override them. [BaseDatabaseWrapper](../../django/db/backends/base/base.py) initializes `self.features = self.features_class(self)` at line 116. | `sql/compiler.py:181,205,403` reads `connection.features` for grouping and ordering decisions. | A flag/default change can silently change generated SQL across backends. Check feature overrides and backend-specific query tests; import tests alone are insufficient. |
| ORM SQL compiler → backend operations and cursor | `BaseDatabaseOperations` supplies backend SQL operations; `BaseDatabaseWrapper.cursor()` is defined at line 318. | `sql/compiler.py:576` quotes names through `connection.ops`; `execute_sql()` at line 1618 obtains a cursor and executes SQL with parameters. | Method signature, quoting, parameter, or cursor-lifetime changes can alter correctness and resource handling. Validate SQL output and execution, including exceptions. |
| Backend wrapper → backend component classes | `BaseDatabaseWrapper` declares `features_class`, `introspection_class`, `ops_class`, and `SchemaEditorClass`; PostgreSQL assigns implementations at `postgresql/base.py:181,185–187`. | Base initialization constructs the components at `base/base.py:116–118`; schema editing uses `SchemaEditorClass` at line 725. | Renaming or changing component constructors can affect wrapper initialization and schema operations. Check component wiring and schema tests. |
| Admin configuration → checks and changelist | `options.py` imports check classes and creates `ChangeList`; checks and `views/main.py` import configuration classes/constants back. | Custom `ModelAdmin`, inline configuration, and changelist behavior. | Preserve extension hooks, accepted settings, and permission/filter behavior. Relevant regression suites include `tests/admin_views`, `tests/modeladmin`, and admin checks. |

### Dependencies that the import graph cannot fully express

- **Backend loading:** `ENGINE` is a string used by `load_backend()`, not a fixed import of every backend.
- **Compiler dispatch:** `compiler_module` is a string. A small static fan-in for `sql/compiler.py` does not measure all SQL execution that reaches it.
- **Object-level capability access:** `connection.features` and `connection.ops` connect consumers to selected backend objects without direct imports of every feature/operations implementation.
- **Application/admin discovery:** `django/utils/module_loading.py:autodiscover_modules()` loads modules for configured apps using `import_module()`. Plugins and user applications are outside this checkout's graph.
- **Re-exports and compatibility:** `django.apps` exports `AppConfig` and `apps`; `django.db` exports connections and exceptions. `load_backend()` also rewrites the historical PostgreSQL backend name. These are public or compatibility surfaces, not path aliases configured by a package manager.

## Thin entry points, facades, and internal hubs

Fan-in counts distinct files with a mapped edge to the file; fan-out counts distinct mapped targets. Self-edges are excluded. Counts use the full saved production map, not a directory-only rendering. They indicate structural position, not complexity, runtime frequency, or business criticality. Role labels were checked against source rather than inferred solely from degree.

| File | Fan-in | Fan-out | Source-grounded role |
|---|---:|---:|---|
| `django/__main__.py` | 0 | 1 | Thin execution entry point: delegates `python -m django` to `management.execute_from_command_line()`. No importers does not mean no users. |
| `django/apps/__init__.py` | 82 | 2 | Four-line public facade: re-exports `AppConfig` and `apps`, with no application-processing logic. Its broad fan-in reflects API usage. |
| `django/db/__init__.py` | 101 | 3 | Public facade **with lifecycle behavior**: creates connection/router objects and registers request-start/request-finish signal handlers. It must not be described as a logic-free initializer. |
| `django/contrib/admin/options.py` | 11 | 41 | Internal coordination hub: admin configuration, hooks, checks, utilities, and changelist creation. High outgoing coupling supports reviewing changes across these collaborators. |
| `django/db/models/query.py` | 7 | 21 | QuerySet behavior and execution coordination; deeper implementation behind the public models API. |
| `django/db/models/sql/query.py` | 9 | 17 | Internal query-construction hub; connects lookups, expressions, and backend compiler selection. |
| `django/db/models/sql/compiler.py` | 3 | 16 | Deep SQL-generation/execution implementation. Dynamic compiler selection makes static incoming degree an incomplete measure of importance. |
| `django/db/backends/base/features.py` | 5 | 1 | Shared capability contract with backend subclasses; low fan-out does not imply low change impact. |

## Who depends on a changed module?

The following reverse-dependency analysis uses the full saved map, preserving consumers outside the illustrated directory. Direct and transitive file lists are saved in [change-impact.json](tach-cycles/change-impact.json). Transitive counts include direct dependents, exclude the changed file, and visit each reachable file once.

| Changed file | Direct dependents in Tach | Transitive dependents | What may be affected; next validation |
|---|---|---:|---|
| `db/backends/base/features.py` | Five feature modules: `dummy`, `mysql`, `oracle`, `postgresql`, `sqlite3`. | 27 | Backend capability defaults and inherited overrides. SQL compiler consumers can be affected through `connection.features` even when no direct import is recorded. Validate changed capability behavior on affected databases. |
| `db/backends/base/operations.py` | `dummy/base.py` plus operations modules for MySQL, Oracle, PostgreSQL, SQLite. | 24 | Backend-specific SQL generation and compiler dispatch. Review overrides, signatures, quoting, and query execution. |
| `db/models/sql/compiler.py` | `backends/base/operations.py`, `backends/mysql/compiler.py`, `backends/postgresql/compiler.py`. | 27 | Compiler subclasses/re-exports and query execution across selected backends. Dynamic dispatch broadens the behavioral scope beyond direct importers. |
| `contrib/admin/options.py` | Nine admin files: `__init__.py`, `checks.py`, `decorators.py`, `filters.py`, `sites.py`, `templatetags/admin_filters.py`, `templatetags/admin_urls.py`, `utils.py`, `views/main.py`; also `auth/admin.py` and `contenttypes/admin.py`. | 25 | Admin configuration, checks, views, and integrations for auth/content types. Validate custom hooks, permissions, filters, and changelist behavior. |

For `apps/__init__.py`, `db/__init__.py`, `db/utils.py`, `models/query.py`, `models/sql/query.py`, and `backends/base/base.py`, reverse traversal reaches **610 files each**. This is a broad **static review envelope** caused by cyclic connectivity, not a prediction that all 610 files execute the affected path or will fail. These counts should not rank change risk without examining imported symbols and behavior. Tests are excluded from the map; test suites mentioned here are follow-up targets, not inferred test coverage.

### Focused impact graph: backend feature contract

This graph answers **“Who depends on the backend feature contract?”** It contains the five direct file-level consumers from Tach and one explicitly annotated behavioral consumer. Solid arrows are mapped dependencies. The dashed arrow represents the SQL compiler reading the selected backend object's feature contract; it does not claim a direct import of `BaseDatabaseFeatures` or that every backend uses the base defaults unchanged.

![Backend feature contract consumers](tach-cycles/backend-feature-impact.png)

[Open scalable SVG](tach-cycles/backend-feature-impact.svg) · [Graphviz source](tach-cycles/backend-feature-impact.dot)

## Scoped import list and reproducibility

[Import inventory](tach-cycles/imports.md) lists **187 syntactic import statements across 11 reviewed files**, with source lines and module/local scope. It includes standard-library and third-party imports; the saved Tach map primarily describes resolved in-repository file relationships. These are different representations and their counts should not be equated.

The reviewed files are the eight role-table files plus `django/db/utils.py`, `django/db/backends/base/base.py`, and `django/db/backends/base/operations.py`. The inventory is scoped intentionally; it is not a dump of every import in the repository. CSV form is available as [imports.csv](tach-cycles/imports.csv).

Regenerate the scoped inventory and reverse-dependency evidence from the saved Tach JSON:

```sh
python3 context/map/tach-cycles/supplement.py
```

To refresh the dependency snapshot after code changes, run `tach map -o context/map/tach-cycles/dependencies.json` from the repository root first, then rerun the supplement. This does **not** regenerate the earlier cycle selection or Graphviz artifacts; revalidate those separately against the new snapshot. The results in this document remain tied to the analyzed HEAD.


## Selected minimal runtime cycles

Paths are relative to the area shown. **M** = module-level import; **L** = local import inside a function/method. Line numbers refer to the analyzed HEAD. All loops below contain two files.

| Area | Minimal loop | Tach-backed source evidence | Why it matters when changing legacy code | Territory-map connection | Next check |
|---|---|---|---|---|---|
| PostgreSQL backend | `base.py ↔ introspection.py` (M/M) | `base.py:80` imports introspection; `introspection.py:6` imports `psycopg_version` from base. | Moving the version helper below the introspection import can expose an uninitialized symbol. | Backends: 55 commits; driver compatibility is a named concern. | Whether driver-version detection can live independently; fresh-process backend initialization. |
| SQLite backend | `base.py ↔ features.py` (M/M) | `base.py:23`; `features.py:10` imports `Database` from base. | Feature definitions depend on the module loading them. | Backends: 55; capability contracts are highlighted. | Definition order and feature initialization. |
| SQLite backend | `base.py ↔ operations.py` (M/M) | `base.py:25`; `operations.py:17` imports `Database` from base. | SQL operations and backend setup depend on a shared initialization order. | Active backend area. | Ownership of the driver reference. |
| Oracle backend | `base.py ↔ operations.py` (M/M) | `base.py:65`; `operations.py:14` imports `Database` from base. | Moving adapter or SQL-operation code can affect both modules' initialization. | Backend repairs include Oracle behavior. | Backend initialization after driver/operations changes. |
| Oracle backend | `base.py ↔ utils.py` (M/M) | `base.py:67`; `utils.py:4` imports `Database` from base. | Utilities depend on initialization of the backend that consumes them. | Backends: 55. | Separating driver access from reusable helpers. |
| ORM | `manager.py ↔ query.py` (M/L) | `manager.py:7` imports `QuerySet`; `query.py:410` imports `Manager`. | Manager creation requires understanding both sides and preserving deferred import behavior. | ORM: 126; `query.py`: 24 commits. | `QuerySet.as_manager()` and custom managers. |
| ORM / SQL | `lookups.py ↔ sql/query.py` (L/M) | `lookups.py:45,377,507` import `Query`; `sql/query.py:37` imports `Lookup`. | Lookup semantics and query construction constrain each other. | ORM: 126; SQL construction: 27; 28 recent ORM repair commits. | Lookup, subquery, and expression-resolution tests. |
| ORM / fields | `expressions.py ↔ fields/__init__.py` (M/L) | `expressions.py:13`; field imports at lines 427, 580, 594, 1074, 1092. | Fields construct expressions while expressions need fields. Extraction changes both contracts. | Field code: 42 commits. | Defaults, `Col`, `Value`, and output-field inference. |
| ORM / relations | `base.py ↔ fields/related.py` (M/L) | `base.py:44`; `related.py:238` imports `ModelBase`. | Model construction and relation resolution are intertwined. | ORM: 126. | Lazy relations, abstract models, app initialization. |
| ORM / public API | `__init__.py ↔ base.py` (M/M) | `__init__.py:64`; `base.py:31` imports symbols from `django.db.models`. | Implementation imports back through its exporter. The initializer explicitly warns about import sorting and circular imports. | Most active area: ORM, 126. | Preserve public API initialization order during import cleanup. |
| Admin / checks | `checks.py ↔ options.py` (L/M) | `checks.py:622,911,991`; `options.py:20`. | Checks inspect the classes that themselves select those checks. | Admin: 86; `options.py`: 28 commits. | Custom `ModelAdmin` and inline checks. |
| Admin / filters | `filters.py ↔ options.py` (M/L) | `filters.py:12` imports an exception; `options.py:504` imports `SimpleListFilter`. | A shared exception couples filters to their configuration module. | Admin: 86; search/UI repair activity. | Whether the exception belongs in `admin.exceptions`. |
| Admin / changelist | `options.py ↔ views/main.py` (L/M) | `options.py:907,2326,2581`; `views/main.py:11`. | Configuration creates the view, which depends on configuration constants and exceptions. | Admin: 86; strong co-change with admin-view tests. | Filters, changelist parameters, permissions. |
| Admin / utilities | `options.py ↔ utils.py` (M/L) | `options.py:27`; `utils.py:136` imports `EMPTY_VALUE_STRING`. | Shared utilities reach back into a large configuration module for a constant. | `options.py`: 28 commits. | Constant ownership and empty-value display compatibility. |
| Admin / public API | `__init__.py ↔ sites.py` (M/M) | `__init__.py:24`; `sites.py:6` imports `ModelAdmin, actions` from admin. | Site initialization assumes earlier package exports are ready. | Admin: 86. | Model registration, custom `AdminSite`, autodiscovery. |
| Utilities / HTML | `html.py ↔ text.py` (M/L) | `html.py:22` imports `normalize_newlines`; `text.py:109` imports `VOID_ELEMENTS`. | Text parsing uses HTML data while HTML uses text helpers. | Utilities: 60, growing; 8 recent repair commits. | HTML truncation and void-element handling. |
| Utilities / translation | `translation/__init__.py ↔ trans_real.py` (L/M) | `__init__.py:67`; `trans_real.py:21` imports `to_language, to_locale`. | Lazy implementation selection depends on helpers in its own facade. | Utilities: 60; language/cache repairs are highlighted. | First translation use, settings setup, state reset in tests. |

## Graphviz renders

The initial cycle report produced no DOT/SVG, as requested at that stage. The user subsequently authorized Graphviz renders, first focused and then for entire directories. All outputs are local files; no hosting or publication was performed.

The focused graph asks: **Why can PostgreSQL initialization changes break introspection?** It is an induced subgraph containing only `postgresql/base.py` and `postgresql/introspection.py`, with both directed runtime edges and symbol/line annotations. It was filtered explicitly from Tach JSON.

The full Django graph uses all nodes and edges in the saved Tach map. Directory graphs enumerate every existing `.py` file below the requested directory and include only Tach edges whose two endpoints are in that directory. Thus isolated Python files remain visible, while dependencies crossing the directory boundary are omitted. **No internal cycle does not imply no cycle through modules outside the directory.**

Large graphs use Graphviz's `sfdp` layout through `dot -Ksfdp -Tsvg`; small graphs use the default `dot` layout. XML node/edge counts were checked for the directory renders. PNG previews were visually inspected for the focused PostgreSQL, apps, and base-backend diagrams; no visual inspection of the full Django, db, or backends diagrams was recorded.

| Render | Nodes | Edges | Scope / interpretation |
|---|---:|---:|---|
| PostgreSQL focused runtime cycle | 2 | 2 | Two module-level imports. `psycopg_version()` is defined before introspection is imported. |
| Entire Django Tach graph | 700 | 3,328 | Existing Tach exclusions still apply; no module collapsing. |
| `django/apps` | 3 | 3 | `__init__.py → config.py`, `__init__.py → registry.py`, `registry.py → config.py`; no internal cycle. |
| `django/db` | 123 | 460 | All Python modules and internal mapped edges; models, backends, and migrations have different colors. |
| `django/db/backends/base` | 9 | 2 | Internal mapped edges: `base.py → __init__.py`, `base.py → validation.py`. Sparse internal edges do not mean the modules have no outside dependencies. |
| `django/db/backends` | 56 | 100 | All Python modules and internal mapped edges, colored by backend family. |

## Graph previews

PNG previews are embedded for Markdown viewer compatibility. Open the SVG links for scalable detail.

### PostgreSQL runtime cycle

![PostgreSQL runtime cycle dependency graph](tach-cycles/postgresql-runtime-cycle.png)

[Open SVG](tach-cycles/postgresql-runtime-cycle.svg)

### Entire Django

![Entire Django dependency graph](tach-cycles/django-full.png)

[Open SVG](tach-cycles/django-full.svg)

### django/apps

![django/apps dependency graph](tach-cycles/django-apps.png)

[Open SVG](tach-cycles/django-apps.svg)

### django/db

![django/db dependency graph](tach-cycles/django-db.png)

[Open SVG](tach-cycles/django-db.svg)

### django/db/backends/base

![django/db/backends/base dependency graph](tach-cycles/django-db-base.png)

[Open SVG](tach-cycles/django-db-base.svg)

### django/db/backends

![django/db/backends dependency graph](tach-cycles/django-db-backends.png)

[Open SVG](tach-cycles/django-db-backends.svg)

## Saved artifacts

Artifacts are stored in the repository in:

`context/map/tach-cycles/`

- [Raw Tach JSON map](tach-cycles/dependencies.json)
- [Selected-cycle evidence with import statements](tach-cycles/evidence.md)
- [Focused PostgreSQL SVG](tach-cycles/postgresql-runtime-cycle.svg) · [DOT source](tach-cycles/postgresql-runtime-cycle.dot)
- [Full Django SVG](tach-cycles/django-full.svg) · [DOT source](tach-cycles/django-full.dot)
- [Apps SVG](tach-cycles/django-apps.svg) · [DOT source](tach-cycles/django-apps.dot)
- [DB SVG](tach-cycles/django-db.svg) · [DOT source](tach-cycles/django-db.dot)
- [Base-backend SVG](tach-cycles/django-db-base.svg) · [DOT source](tach-cycles/django-db-base.dot)
- [Backends SVG](tach-cycles/django-db-backends.svg) · [DOT source](tach-cycles/django-db-backends.dot)

The exploratory `analyze.py`, `cycles.json`, and `unmatched.json` also remain in that directory. They are intermediate diagnostics: the script does not resolve every Tach edge, so its cycle inventory must not be used as a complete count of runtime cycles. The 17 directly verified loops in `evidence.md` are the reported selection.

## Repository changes

This structure-analysis work did not change Django implementation, tests, dependency declarations, or Tach configuration. `context/` and `tach.toml` were already untracked when the work began. This summary adds `context/map/artifact-2-structure.md`. At the user’s subsequent request, the structure-analysis artifacts were moved into `context/map/tach-cycles/`, and the summary links were updated to relative repository paths. The exploratory script now resolves the repository root from its own location. No commit or remote write was performed.
