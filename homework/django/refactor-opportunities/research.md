---
date: 2026-11-05T12:14:43+01:00
researcher: Codex
git_commit: b501b8493f31cf8cba31211d59b3b78642b8cb02
branch: main
repository: django
topic: Refactoring opportunities in Django's model save and update flow
tags: [research, orm, persistence, refactoring, verified]
status: complete
last_updated: 2026-11-06
verification_commit: b501b8493f31cf8cba31211d59b3b78642b8cb02
last_updated_by: Codex
---

# Refactor opportunities in Django’s model save and update flow

Which findings from the [post-flow analysis](../post-flow-analysis/research.md) justify a structural change, what shape could it take, and in what order would it be worth pursuing? This report proposes options for a separate planning session.

## Finding inventory and classification

A **candidate** is a recorded problem whose remedy would change code structure. C2 isolates one decision within the broader C3 finding because the two options have different costs and compatibility risks.

| ID | Finding | Classification and reason |
|---|---|---|
| C1 | Partial saves select fields for writing by field name or attribute name, then check the field name again when choosing expression values to refresh. | **Candidate.** One field-selection decision could govern both operations. The difference is observable on SQLite. |
| C2 | The model infers UPDATE success from the shape of a private result shared with the queryset and SQL compiler. | **Candidate.** The model could give the success decision an explicit meaning while preserving the compiler protocol. |
| C3 | Knowledge of a successful save is distributed across model state, parent saves, hooks, query construction, backend capabilities, converters, and delayed reads. | **Candidate, considered broadly.** Consolidation would change code structure. The evidence favors retaining the current responsibilities. |
| C4 | Manager and QuerySet depend on each other, with a local import in as_manager(). | **Candidate.** Removing the dependency cycle would change module structure. History gives a concrete reason to retain it. |
| N1 | The forced-update test loops over three exception classes but asserts the same broad DatabaseError each time. The partial-save missing-row test repeats the pattern. | **Test debt.** Both assertions matter when estimating C2’s verification cost. See [forced update](../../../tests/force_insert_update/tests.py#L55) and [partial save](../../../tests/update_only_fields/tests.py#L304) — 304 (report: 299). |
| N2 | The comment on _state.adding describes validation only, while the save path reads the flag when choosing INSERT for a default-bearing primary key. | **Documentation debt.** Correcting the [comment](../../../django/db/models/base.py#L489) requires no change to the [save branch](../../../django/db/models/base.py#L1118) — 1118 (report: 1112). |
| N3 | The identified tests cover a scalar FK attribute name and an ordinary field expression separately. | **Test gap supporting C1.** The experiment below establishes a runtime difference for the combined case. |
| N4 | Save-time deferral of generated or expression values combined with FETCH_PEERS or FETCH_RAISE. | **Test evidence gap.** The named suites establish ordinary deferred-fetch behavior. The post-save combination remains open. |
| N5 | Exceptional asave() calls, including forced failures and signal exceptions. | **Test evidence gap.** The named async test exercises a successful update and refetch. |
| N6 | Inherited-save failure combined with signal side effects and rollback. The named inherited forced-save test checks exception-free execution, and the named admin smoke test checks a redirect. | **Test evidence gap.** These observations limit confidence in a C3 migration. They concern specific tests. |
| N7 | Static import reach misses dynamic compiler selection, backend overrides, external managers and hooks, and tests. ORM co-change mixes reads with writes. | **Measurement limitation.** Use concrete callers, overrides, and historical changes to estimate impact. |
| N8 | Executed branch coverage, backend skips, production incidence, external overrides, trigger behavior, and complete migration and generated-code impact remain unknown. | **Evidence limits.** They constrain confidence and verification cost. The prior report establishes no corresponding structural defect. |

**Evidence base.** Three read-only reviewers examined current structure, Git history, and migration feasibility. The starting evidence was the [prior analysis](../post-flow-analysis/research.md), its [structural audit](../post-flow-analysis/ast-grep-audit.md), the [repository map](../../map/repo-map.md), and the [structure report](../../map/artifact-2-structure.md). A separate in-memory SQLite probe tested C1. Pre-existing staged changes to bulk-update batching and its tests shift later working-tree line numbers in query.py. Anchors refer to the recorded commit except where marked.

**Behavior to preserve.** Instance, queryset, and bulk writes have distinct hook contracts. An explicit primary key can target an existing row. A post_save signal can precede an outer transaction commit. Readback can require another query. Changing those semantics would require a separate behavioral proposal. [Prior behavioral analysis](../post-flow-analysis/research.md#L113)

## Candidate findings

### C1. Use the selected fields consistently for expression readback

**Evidence — current shape.** Django validates update_fields against metadata that includes both Field.name and Field.attname. For each table, _save_table() selects concrete Field objects under either spelling and builds its write values from that selection. When choosing expressions to read back, it iterates those selected values but checks field.name against the original strings again. For a foreign key, profile and profile_id can therefore select the same write and different readback behavior. The original strings are also visible to signal receivers. [Field-name metadata](../../../django/db/models/options.py#L1025) — 1025 (report: 1015) · [Table selection and readback](../../../django/db/models/base.py#L1100) — 1100 (report: 1096) · [Signal arguments](../../../django/db/models/base.py#L982)

**Evidence — runtime.** On SQLite 3.54.1, the probe created two Profile rows with IDs 1 and 2. For each case, a fresh Employee pointed to profile 1. The probe assigned `employee.profile_id = F("profile_id") + 1`, saved with the indicated spelling, read the stored ID independently, then counted queries during first access to employee.profile_id.

| SQLite UPDATE returning | update_fields spelling | Stored ID | First instance access | Queries on that access |
|---|---|---:|---|---:|
| Enabled, native setting | profile | 2 | Integer 2 | 0 |
| Enabled, native setting | profile_id | 2 | Unevaluated expression | 0 |
| Disabled for the probe | profile | 2 | Integer 2 | 1 |
| Disabled for the probe | profile_id | 2 | Unevaluated expression | 0 |

The reproduced consequence is **stale expression state on the Python instance after a successful database write**. Disabling SQLite’s capability exercised Django’s fallback branch. Actual MySQL, MariaDB, PostgreSQL, and Oracle driver behavior for this case remains **unknown**. Django documents immediate refresh on supporting backends and deferred refresh otherwise. [Expression refresh contract](../../../docs/ref/models/expressions.txt#L223)

**Intentionality.** Commit `0f49b2bce2` explicitly added attname support for save(update_fields=...). Commit `94680437a4` introduced expression refresh and the second, name-only predicate. Its regression test distinguishes selected from excluded expressions using an ordinary field. **Inference:** alias support and refreshing selected expressions are deliberate. Their divergence on a foreign key is likely incidental. The author’s reason for the second spelling check is **unknown**. [Expression regression test](../../../tests/update_only_fields/tests.py#L313)

**Feasibility.** The selected Field objects already exist. Using them for readback permits a local change while preserving the strings that signal receivers see. A later patch would correct observable behavior and should be reviewed as a bug fix. The guards are name/attname equivalence, exclusion of an unselected expression, the original signal payload, and first-access behavior with and without UPDATE returning. [Partial-save tests](../../../tests/update_only_fields/tests.py#L172)

### C2. Make the model’s interpretation of private UPDATE results explicit

**Evidence — current shape.** In the private queryset method, returning_fields=None selects a row count. Passing any non-None value selects the returning path; the intended argument is an iterable, including an empty one (report: "Passing an iterable, including an empty one, selects the returning path."). When columns cannot or need not be returned, the compiler converts the affected-row count to empty tuples. The model also produces [()] when a partial save skips a parent table, or when select_on_save confirms the row still exists after an apparent miss. The no-values branch additionally covers PK-only models whose row still exists. The model tests the truth of this collection and consumes its first row. Consequently, [()] can mean “continue this save successfully” even when no physical UPDATE occurred on that table. Public QuerySet.update() has its own count-returning path. [Private queryset method, working tree](../../../django/db/models/query.py#L1492) · [Compiler results](../../../django/db/models/sql/compiler.py#L2174) — 2174 (report: 2158) · [Model-produced results](../../../django/db/models/base.py#L1237) — 1237 (report: 1229)

**Intentionality.** Commit `55a0073b3b` introduced UPDATE returning for generated fields and the empty-tuple representations. Commit `e973ee6a98` records the need for select_on_save, including a trigger case where the database can report an apparent miss. **Verdict:** the success distinctions and backend fallback are deliberate constraints. Why tuples were preferred is **unknown**. The sources establish a maintenance cost in interpreting the protocol. No runtime failure attributable to the encoding was established.

**Feasibility.** The smallest reversible option is to name the interpretation at the model boundary, keeping compiler results and public row counts intact. First characterize a missing row, a successful save with no returned columns, a converted row, a skipped parent table, and a successful existence recheck. A test override returns integer 0 after a real update, so assuming that every intermediate result is a list would lose an exercised case. The broad exception assertions in N1 weaken protection for this change. [Recovery test](../../../tests/basic/tests.py#L890) — 890 (report: 873) · [Fallback and exceptions](../../../django/db/models/base.py#L1157) · [Assignment and deferral](../../../django/db/models/base.py#L1274) — 1274 (report: 1267)

### C3. Retain the existing persistence responsibilities

**Evidence — current shape.** The model coordinates signals, transactions, parent writes, and state transitions in save_base(). Its parent-save method handles recursion and parent links. Its table-save method chooses and carries out a table write. Fields own their pre_save hooks, backends select compilers, and admin separately coordinates the model and related objects. Fixture deserialization calls Model.save_base() directly, giving this boundary a concrete caller outside ordinary save(). [Model coordination](../../../django/db/models/base.py#L965) · [Fixture caller](../../../django/core/serializers/base.py#L294) · [Admin hooks](../../../django/contrib/admin/options.py#L1471)

**Intentionality.** Commit `6b4834952d` explicitly separated save coordination, parent recursion, and per-table writes. Its rationale included query cost and transaction timing for inherited saves. **Verdict:** this division carries deliberate behavior. The intent behind every later interaction and the payoff from a new coordinator remain **unknown**.

**Feasibility.** A broad move would require evidence across raw fixture loads, inheritance, signals, transaction timing, field overrides, and backend-dependent readback. Commit `a2348c85fc6c` fixed a parent-PK default issue alongside basic, composite-key, and inline-formset tests. A change in model code can reach forms without touching their source. **Disposition:** retain existing ownership. The prerequisite for reconsideration is a specific failure or recurring maintenance burden that C1 or C2 cannot address. [Prior co-change evidence](../post-flow-analysis/research.md#L177)

### C4. Retain the deferred Manager import

**Evidence — current shape.** Manager is constructed from QuerySet at module import time. In the opposite direction, QuerySet.as_manager() imports Manager when called. Managers built this way carry information used in deconstruction, and the migration serializer can emit MyQuerySet.as_manager(). Changing this relationship reaches startup, custom manager construction, method forwarding, and historical migration expressions. [Manager construction](../../../django/db/models/manager.py#L176) · [Deferred import](../../../django/db/models/query.py#L410) — 410 (report: 408) · [Migration serializer](../../../django/db/migrations/serializer.py#L269) — 269 (report: 266)

**Intentionality and feasibility.** Commit `31fadc1202` introduced chainable manager/queryset methods. The source comment identifies the circular dependency as the reason for the local import. **Verdict:** deliberate initialization constraint. A shared factory would have compatibility costs. The reviewed evidence identifies no save failure or measurable maintenance cost caused by the current arrangement. Downstream manager behavior remains **unknown**. **Disposition:** retain the deferred import. A reproducible fresh-process initialization failure would justify reopening it, with custom-manager construction and migration deconstruction as the first guards. [Manager tests](../../../tests/custom_managers/tests.py#L579)

## Refactor opportunities

1. **C1 — duplicated spelling checks → one selected-field decision for writing and expression readback.** Highest priority. The SQLite experiment demonstrates user-visible incorrect instance state, and the field representation already exists. The blast radius is concentrated in instance partial saves, expression refresh, deferred reads, and signal arguments. **First prerequisite:** capture the paired profile/profile_id reproduction as a regression test, preserving the excluded-expression and signal assertions. A later implementation can then change the readback decision at one site and verify both capability branches. Ordinary PR CI runs SQLite on Windows and Ubuntu. The PostgreSQL coverage workflow is label-gated. Native non-returning-driver validation remains outstanding. [PR workflow](../../../.github/workflows/tests.yml#L27) · [Coverage workflow](../../../.github/workflows/coverage_tests.yml#L18)

2. **C2 — implicit collection truthiness → explicitly named save-success interpretation at the model boundary.** A conditional second choice. A maintainer currently has to trace both compiler-produced and model-produced placeholders to understand why fallback is safe. The benefit is clarity. The change cost is higher than C1 because an incorrect interpretation could alter INSERT fallback, forced-update exceptions, inheritance behavior, or deferred readback. **First prerequisite:** characterize those meanings and strengthen the forced-failure assertions. A model-local clarification can then be evaluated independently. A compiler-wide result type would require additional evidence of benefit.

**Considered and rejected.** C3’s broad reorganization has a wider compatibility cost than the demonstrated problem warrants. C4’s local import has a documented purpose and tested downstream contracts. Neither warrants a third place in the ranking.


## Weryfikacja twierdzeń (ast-grep)

Verified on 2026-11-06 with ast-grep 0.51.1 against source commit
`b501b8493f31cf8cba31211d59b3b78642b8cb02` plus the existing working tree.
`verification_commit` identifies that source baseline, not a newly created audit
commit. Existing staged edits in `django/db/models/query.py` and
`tests/queries/test_bulk_update.py` were preserved; evidence below uses current
working-tree line numbers. The more precise inline anchors retain their original
numbers as `new (report: old)`; these are anchor refinements, not all shifted code.

Scope: all concrete structural premises in this report, including supporting test
shapes. This report contains no numerical method totals, “overrides X but not Y”
assertions, exhaustive caller totals, or mirrored-type pairs. References to prior
reports do not import all of their claims into this audit. Runtime probe outcomes,
historical intent, co-change history, and projected compatibility costs cannot be
proved by AST matching and were not re-tested here. Intentionality verdicts and
the complete ranked section above remain unchanged.

Reproduce from the repository root with
`python3 context/changes/refactor-opportunities/verify_ast_grep.py`.
Each S-ID below identifies an executed Python pattern and its exact search scope
in [the machine-readable results](verification-ast-grep.json); the
[runner](verify_ast_grep.py) retains all patterns. For multiline function patterns,
`<body>` below means the actual `$$$BODY` wildcard, not a separate query.
Counts are syntactic matches within the recorded scope, not dynamic caller counts.
Full matched source was inspected to verify enclosing functions and branches.

| Claim | Verdict | Evidence (file:line) | Method (pattern/rule) |
|---|---|---|---|
| S01: N1: both forced-failure tests enumerate three exception classes | confirmed — 2 lists, each with 3 classes | `tests/force_insert_update/tests.py:55`; `tests/update_only_fields/tests.py:304` | `exceptions = [DatabaseError, ObjectNotUpdated, $TYPE.NotUpdated]` |
| S02: N1: both loops assert DatabaseError rather than the loop variable | confirmed — 2 relevant assertions (13 broad matches) | `tests/force_insert_update/tests.py:59`; `tests/update_only_fields/tests.py:308` | `self.assertRaisesMessage(DatabaseError, msg)` |
| S03: C1: field metadata includes name and attname | confirmed | `django/db/models/options.py:1025`; `django/db/models/options.py:1027` | `names.append($FIELD)` |
| S04: C1: save validates update_fields against that metadata | confirmed | `django/db/models/base.py:884` | `update_fields.difference(field_names)` |
| S05: C1: table selection accepts both spellings | confirmed | `django/db/models/base.py:1100` | `f.name in update_fields or f.attname in update_fields` |
| S06: C1: write tuples use selected fields and pre_save | confirmed | `django/db/models/base.py:1129` | `getattr(self, f.attname) if raw else f.pre_save(self, False)` |
| S07: C1: readback rechecks only field.name | confirmed | `django/db/models/base.py:1144` | `update_fields is None or field.name in update_fields` |
| S08: C1: expression detection appends the selected field | confirmed — UPDATE site; second match belongs to INSERT | `django/db/models/base.py:1147` | `returning_fields.append(field)` |
| S09: C1: both save signals receive original update_fields | confirmed | `django/db/models/base.py:982`; `django/db/models/base.py:1017` | `$SIGNAL.send($$$ARGS, update_fields=update_fields, $$$REST)` |
| S10: N3: scalar FK attname is tested independently | confirmed | `tests/update_only_fields/tests.py:172` | `$OBJ.save(update_fields=["profile_id"])` |
| S11: N3: expression test separates selected and excluded pid | confirmed | `tests/update_only_fields/tests.py:317`; `tests/update_only_fields/tests.py:319` | `obj.save(update_fields={$FIELD})` |
| S12: C2: private _update defaults returning_fields to None | confirmed | `django/db/models/query.py:1492` | `def _update(self, values, returning_fields=None): <body>` |
| S13: C2: None chooses count; other values choose returning | refined — test is identity with None; no iterable type check | `django/db/models/query.py:1506` | `if returning_fields is None:;     return query.get_compiler(self.db).execute_sql(ROW_COUNT)` |
| S14: C2: private returning path calls compiler | confirmed | `django/db/models/query.py:1508` | `query.get_compiler(self.db).execute_returning_sql(returning_fields)` |
| S15: C2: compiler fallback covers empty fields and unsupported returning | confirmed | `django/db/models/sql/compiler.py:2170` | `not returning_fields or not self.connection.features.can_return_rows_from_update` |
| S16: C2: compiler converts row count to empty tuples | confirmed | `django/db/models/sql/compiler.py:2174` | `return [()] * row_count` |
| S17: C2: skipped table produces [()] | refined — also handles existing PK-only models | `django/db/models/base.py:1237` | `return [()]` |
| S18: C2: existence recheck can produce [()] | confirmed | `django/db/models/base.py:1251` | `return [()] if filtered.exists() else []` |
| S19: C2: model uses collection truthiness | confirmed | `django/db/models/base.py:1157` | `bool(results)` |
| S20: C2: model consumes first returned row | confirmed — UPDATE site; second match belongs to INSERT | `django/db/models/base.py:1158` | `self._assign_returned_values(results[0], returning_fields)` |
| S21: C2: public update uses count path | confirmed — public update; second match is private _update | `django/db/models/query.py:1481` | `query.get_compiler(self.db).execute_sql(ROW_COUNT)` |
| S22: C2: test override runs real _update then returns integer zero | confirmed | `tests/basic/tests.py:890` | `def _update(self, *args, **kwargs):;     FakeQuerySet.called = True;     super()._update(*args, **kwargs);     return 0` |
| S23: C2: returned values assigned and unreturned fields deferred | confirmed | `django/db/models/base.py:1274` | `self.__dict__.pop(field.attname, None)` |
| S24: C3: save_base owns transaction boundary | confirmed | `django/db/models/base.py:991` | `transaction.atomic(using=using, savepoint=False)` |
| S25: C3: save_base writes state | confirmed | `django/db/models/base.py:1013` | `self._state.adding = False` |
| S26: C3: parent method recurses | confirmed — 2 call sites: save_base and recursive parent save | `django/db/models/base.py:999`; `django/db/models/base.py:1045` | `self._save_parents($$$ARGS)` |
| S27: C3: save_base and parent method call table write | confirmed — 2 call sites: save_base and parent save | `django/db/models/base.py:1002`; `django/db/models/base.py:1052` | `self._save_table($$$ARGS)` |
| S28: C3: parent links are synchronized | confirmed | `django/db/models/base.py:1065` | `setattr(self, field.attname, self._get_pk_val(parent._meta))` |
| S29: C3: fixture deserializer bypasses save via Model.save_base | confirmed | `django/core/serializers/base.py:294` | `models.Model.save_base(self.object, using=using, raw=True, **kwargs)` |
| S30: C3: fields define pre_save hooks | confirmed — 5 definitions in field modules; not a repository-wide override census | `django/db/models/fields/files.py:328`; `django/db/models/fields/__init__.py:1027`; `django/db/models/fields/__init__.py:1551`; `django/db/models/fields/__init__.py:1691`; `django/db/models/fields/__init__.py:2682` | `def pre_save($$$ARGS): <body>` |
| S31: C3: backend operations select compiler | confirmed | `django/db/backends/base/operations.py:406` | `def compiler($$$ARGS): <body>` |
| S32: C3: admin saves model separately | confirmed | `django/contrib/admin/options.py:1471` | `def save_model($$$ARGS): <body>` |
| S33: C3: admin saves related objects separately | confirmed | `django/contrib/admin/options.py:1493` | `def save_related($$$ARGS): <body>` |
| S34: C4: Manager is built from QuerySet at module load | confirmed | `django/db/models/manager.py:176` | `class Manager(BaseManager.from_queryset(QuerySet)): <body>` |
| S35: C4: manager module imports QuerySet | confirmed | `django/db/models/manager.py:7` | `from django.db.models.query import QuerySet` |
| S36: C4: QuerySet imports Manager inside as_manager | confirmed via S44 — initial compound pattern had 0 matches; grep found the import | `django/db/models/query.py:410` (grep and S44) | `def as_manager(cls):;     $$$BEFORE;     from django.db.models.manager import Manager;     $$$AFTER` |
| S37: C4: as_manager constructs and marks generated manager | confirmed | `django/db/models/query.py:413` | `manager._built_with_as_manager = True` |
| S38: C4: deconstruction reads generated-manager marker | confirmed | `django/db/models/manager.py:50` | `getattr(self, "_built_with_as_manager", False)` |
| S39: C4: migration serializer emits as_manager expression | confirmed | `django/db/migrations/serializer.py:269` | `return "%s.as_manager()" % name, imports` |
| S40: C4: factory forwards QuerySet methods | confirmed | `django/db/models/manager.py:104` | `new_methods[name] = create_method(name, method)` |
| S41: N2: adding flag selects INSERT for default-bearing PK | confirmed | `django/db/models/base.py:1118` | `all(f.has_default() or f.has_db_default() for f in meta.pk_fields)` |
| S42: N5: named async save test structure | confirmed — 1 call in the named async model test file | `tests/async/test_async_model_methods.py:13` | `await $OBJ.asave($$$ARGS)` |
| S43: N6: inherited forced-save test only calls saves | confirmed — 2 save calls and no explicit assertions in the matched body | `tests/force_insert_update/tests.py:66` | `def test_force_update_on_inherited_model(self): <body>` |
| S44: C4: local Manager import (fallback after S36 pattern miss) | confirmed | `django/db/models/query.py:410` | `from django.db.models.manager import Manager` |
| S45: N5: entire named async save test has update/refetch assertions | refined — happy-path test only; no claim about all async tests | `tests/async/test_async_model_methods.py:11` | `async def test_asave(self): <body>` |
| S46: N6: named admin smoke test asserts redirect | confirmed — redirect assertion at line 647; no saved-row assertion in body | `tests/admin_views/tests.py:641` | `def test_basic_edit_POST(self): <body>` |
| S47: N4: ordinary deferred peer tests protect edits and deleted peers | refined — ordinary deferred loading; no proof of repository-wide coverage absence | `tests/defer/tests.py:263` | `def test_fetch_peers_preserves_local_modification(self): <body>` |
| S48: C2: compiler applies converters before returning rows | confirmed — UPDATE converter site (3 broad matches) | `django/db/models/sql/compiler.py:2187` | `self.apply_converters(rows, converters)` |
| S49: C4: manager factory retains QuerySet class for deconstruction | confirmed | `django/db/models/manager.py:114` | `{"_queryset_class": queryset_class, **cls._get_queryset_methods(queryset_class)}` |
| S50: N4: deferred deleted-peer test is ordinary loading | refined — ordinary deferred loading; combined post-save case remains unverified | `tests/defer/tests.py:275` | `def test_fetch_peers_deleted_peer_does_not_cause_keyerror(self): <body>` |

**Zero-match cross-check.** S36's compound function/import pattern returned zero.
`grep -RnE 'from django.db.models.manager import Manager' django/db/models/query.py`
returned line 410. Inspection places the import inside `as_manager()` at line 408;
S44's import pattern returns exactly one AST match at line 410. This is a pattern
false negative, not evidence of an absent dependency. The exact failed pattern and
grep output remain in the JSON. All other executed patterns matched.

**Ranking implications — decision during planning.** No structural premise was
disproven. C1's alias/readback mismatch is confirmed structurally; this audit does
not independently reproduce the reported SQLite probe. C2's protocol must account
for non-None dispatch, no-values PK-only saves, and the integer-zero test override;
these refinements constrain a proposed abstraction. N4–N6 describe named test
bodies, not an exhaustive coverage census. Any ranking change based on runtime
confidence, broader test coverage, or these protocol refinements is a
**decision during planning**.
