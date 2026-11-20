# Django territory map — session summary

Prepared: **3 November 2026**. Language: English, as requested for the analysis.

## Scope and repository state

- Repository: `django/django`, https://github.com/django/django.git.
- Checkout: `/Users/noemi.kowalewska/Documents/django-10x/django`.
- Analyzed HEAD: `b501b8493f31cf8cba31211d59b3b78642b8cb02`; latest available commit: 2 November 2026.
- Main window: **3 November 2025–3 November 2026**, using committer timestamps and history reachable from HEAD. No unmerged branches or working-tree edits were counted.
- The clone is not shallow. History starts on 13 July 2005, so the full requested twelve-month period is available.
- The repository was initially unavailable/empty at the supplied location; analysis began after the checkout with full history became available. This did not shorten the analyzed window.
- Git and GitHub operations were read-only. No GitHub PRs, issues, comments, labels, settings, or remote refs were changed.

## Counting and filtering

Frequency means **distinct qualifying non-merge commits**, counted once per file or area per commit, rather than changed lines. Additions and deletions count; unchanged pure renames do not. Ties are broken alphabetically.

The practical area buckets are packages/subtrees: `django/db/<subsystem>`, `django/contrib/<app>`, `django/core/<subsystem>`, other `django/<package>`, and `tests/<suite>`. Documentation uses subareas beneath `docs/ref` and `docs/topics`; their parent rows count remaining direct pages, not recursive totals of separately bucketed children. `docs/internals` remains a whole subtree. A few singleton module/file buckets are preserved in the detailed data. One commit may count in multiple buckets.

Excluded lockfiles, snapshots, binary/image/font assets, translation imports/catalogs and locale data, vendored files, fixture data, dotenv/project/CI/build/dependency configuration, release notes, spelling wordlists, release scripts and auxiliary extras. Retained hand-written implementation, templates, CSS/JavaScript, tests, and substantive documentation. Runtime settings implementation such as `django/conf/global_settings.py` remains eligible; deployment/test `settings.py` files do not. Migration test inputs were not discarded just because they resemble generated migrations.

Used `.git-blame-ignore-revs`, commit subjects and selected bodies/diffs to identify formatting, mechanical renaming, rearrangements, and repetitive maintenance. **Commit size alone did not exclude work from the annual activity ranking.** Large retained examples include dictionary-based MAILERS, the Selenium-to-Playwright migration, and expanded `functools.cached_property` support.

| Population | Commits |
|---|---:|
| Non-merge commits in the window | 1,080 |
| Explicit mechanical/translation/version-only exclusions | 41 |
| Other commits touching only excluded paths or unchanged renames | 168 |
| Qualifying commits retained | **871** |
| Retained commits touching implementation | 522 |
| Retained commits touching implementation or tests | 641 |
| Retained commits touching documentation | 347 |

The last three populations overlap. Filtering/classification is heuristic and auditable, not a claim to identify every generated change or hidden use of AI.

## Annual activity: top ten areas

| Rank | Area | Commits | Responsibility |
|---:|---|---:|---|
| 1 | `django/db/models` | **126** | ORM models, fields, queries, expressions, and SQL construction. |
| 2 | `docs/internals` | **92** | Contribution, security, release procedures, and framework deprecations. |
| 3 | `django/contrib/admin` | **86** | Administrative interface for managing application data. |
| 4 | `docs/ref` | **76** | Direct framework reference pages: settings, checks, commands, and other APIs. |
| 5 | `django/utils` | **60** | Shared text, HTML, date, async-compatibility, and deprecation utilities. |
| 6 | `django/db/backends` | **55** | Database connections, execution, capabilities, and schema operations. |
| 7 | `docs/topics` | **49** | Direct feature guides, including email, caching, serialization, and async operation. |
| 8 | `tests/admin_views` | **49** | Admin pages, permissions, actions, and editing workflow coverage. |
| 9 | `docs/ref/models` | **44** | Model fields, QuerySets, expressions, and model behavior documentation. |
| 10 | `tests/gis_tests` | **38** | Geometry, spatial-query, and geographic-database coverage. |

Within the ORM, field code appeared in **42** commits, SQL construction/compiler code in **27**, and `query.py` in **24**. These overlap.

Implementation-only top ten: ORM **126**, admin **86**, utilities **60**, database backends **55**, authentication **34**, GeoDjango **33**, forms **21**, core serializers **20**, HTTP **20**, and test framework **19**.

## Annual activity: top ten files

| Rank | File | Commits |
|---:|---|---:|
| 1 | `tests/admin_views/tests.py` | **33** |
| 2 | `django/contrib/admin/options.py` | **28** |
| 3 | `docs/internals/deprecation.txt` | **25** |
| 4 | `django/db/models/query.py` | **24** |
| 5 | `docs/ref/settings.txt` | **20** |
| 6 | `docs/topics/email.txt` | **18** |
| 7 | `django/db/models/sql/compiler.py` | **17** |
| 8 | `tests/cache/tests.py` | **17** |
| 9 | `django/db/models/sql/query.py` | **16** |
| 10 | `docs/ref/models/querysets.txt` | **16** |

`tests/admin_changelist/tests.py` also has **16** commits and ties at the cutoff; alphabetical ordering places it after the displayed tenth file.

## Monthly activity and trends

The rolling twelve-month window spans **13 calendar-month buckets**. November 2025 begins on the 3rd, and November 2026 ends at the analysis date; neither partial November was used to infer trends. Monthly dates use Europe/Warsaw.

| Area | 2025-11 | 2025-12 | 2026-01 | 2026-02 | 2026-03 | 2026-04 | 2026-05 | 2026-06 | 2026-07 | 2026-08 | 2026-09 | 2026-10 | 2026-11 | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `django/db/models` | 10 | 19 | 8 | 10 | 14 | 11 | 7 | 6 | 2 | 12 | 12 | 14 | 1 | **126** |
| `docs/internals` | 6 | 3 | 8 | 2 | 8 | 11 | 11 | 10 | 10 | 4 | 6 | 13 | 0 | **92** |
| `django/contrib/admin` | 4 | 6 | 8 | 13 | 4 | 12 | 14 | 5 | 6 | 7 | 2 | 5 | 0 | **86** |
| `docs/ref` | 7 | 6 | 2 | 4 | 1 | 8 | 10 | 12 | 5 | 6 | 7 | 8 | 0 | **76** |
| `django/utils` | 7 | 5 | 1 | 3 | 5 | 5 | 5 | 8 | 4 | 1 | 6 | 10 | 0 | **60** |
| `django/db/backends` | 6 | 11 | 6 | 6 | 5 | 2 | 3 | 3 | 2 | 2 | 5 | 4 | 0 | **55** |
| `docs/topics` | 5 | 5 | 3 | 2 | 4 | 8 | 3 | 7 | 4 | 0 | 2 | 6 | 0 | **49** |
| `tests/admin_views` | 1 | 2 | 3 | 8 | 1 | 10 | 8 | 2 | 7 | 4 | 0 | 3 | 0 | **49** |
| `docs/ref/models` | 5 | 7 | 5 | 3 | 2 | 2 | 3 | 1 | 4 | 3 | 5 | 3 | 1 | **44** |
| `tests/gis_tests` | 2 | 2 | 3 | 6 | 0 | 0 | 2 | 0 | 6 | 5 | 2 | 10 | 0 | **38** |

Trend labels are descriptive judgments using the complete December–October series. The comparison below is **December–February → August–October**, in commits. “Seasonal” means episodic/campaign-driven here; one year does not establish recurring annual seasonality. These describe activity, not code quality or completion.

| Area | Label | Early → late | Identifiable campaigns / interpretation |
|---|---|---:|---|
| ORM / models | Steady | 37 → 38 | December peak: ManyRelatedManager hooks/signals (#27380), UUID4/UUID7, and JSON lookups; no single campaign dominates. |
| Internal docs | Growing | 13 → 23 | October: DEP 20 annual-release/calendar-version transition, contribution guidance, and docs tooling. DEP 20 explains only part of the peak. |
| Admin | Fading | 27 → 14 | February: form layout/accessibility. May: change-form actions and permission corrections, plus select_related changes. Lower activity after spring. |
| Reference docs | Growing | 12 → 21 | May–June: MAILERS rollout/settings/checks, signed-cookie security, and CSP guidance. |
| Utilities | Growing | 9 → 17 | October: header-parser/language-cache security work, cached_property migration, and CSP nonce handling. |
| Database backends | Fading | 23 → 11 | December mixes UUID functions, Oracle GeneratedFields, PostgreSQL truncation repairs, and SQL-injection protection; later activity is lower. |
| Topic docs | Seasonal / episodic | 10 → 8 | April: six of eight changes concern email docs; four explicitly reference MAILERS ticket #35514. |
| Admin-view tests | Fading | 13 → 7 | Spring burst: list_editable permissions/security, deletion-confirmation limits, and change-form action coverage. |
| Model reference docs | Steady | 15 → 11 | Low continuing maintenance, with mixed December feature documentation. |
| GIS tests | Seasonal / episodic | 11 → 17 | Quiet stretches alternate with bursts; October combines geometry-input security, test stability, and utility migrations. |

## Bug-fix hotspots in the last three months

Separate window: **3 August–3 November 2026**. Reviewed bug/security repairs and direct repair follow-ups, excluding features, optimizations, deprecations, support removals, formatting, tooling migrations and test-only skips. These are repair-commit counts, not unique incidents or production failure rates.

| Rank | Area | Fix commits | Main problems |
|---:|---|---:|---|
| 1 | ORM / models | **28** | JSON lookup crashes/wrong results, alias resolution, deferred-field overwrites, and database-specific query behavior. |
| 2 | Admin | **10** | Search crashes/over-matching, related-field values, permissions, unsafe links, and UI behavior. |
| 3 | Utilities | **8** | Header parsing, resource exhaustion, CSP, filesystem semantics, and introspection. |
| 4 | GeoDjango | **7** | Unsafe spatial inputs, geometry-limit bypasses, and accidental network-raster deletion. |
| 5 | Database backends | **5** | Unique constraints, unnecessary schema alterations, Decimal conversion, and driver compatibility. |

Forms ties for fifth with **five** fixes, including prevention of forged model-formset actions with editable primary keys. Alphabetical ordering selects database backends at the cutoff.

Illustrative evidence: [JSON lookup correction](https://github.com/django/django/commit/fabce94374), [deferred-field overwrite](https://github.com/django/django/commit/6b212c29e7), [admin search](https://github.com/django/django/commit/fe81969e83), [unsafe admin links](https://github.com/django/django/commit/47511a2102), [header parsing](https://github.com/django/django/commit/7ff7fcc050), [language-cache exhaustion](https://github.com/django/django/commit/c88b304cc2), [network-raster deletion](https://github.com/django/django/commit/fc4eaaabf4), and [constraint preservation](https://github.com/django/django/commit/8cbdd4a814).

## Repair mix in the five busiest annual areas

Django uses `Fixed #ticket` to close enhancement tickets too. Every subject in these five areas was reviewed, with bodies/diffs consulted for ambiguities and reverts. Feature/deprecation docs accompanying a runtime change were not automatically treated as broken documentation. UI/accessibility/wording corrections are separated from behavior/security fixes; that distinction does not imply accessibility is unimportant.

| Area | All commits | Keyword matches¹ | Reviewed fixes² | Behavior/security | UI/docs/wording | Primary reverts | Fix + revert share |
|---|---:|---:|---:|---:|---:|---:|---:|
| `django/db/models` | 126 | 92 (73.0%) | 74 | 73 | 1 | 2 | **60.3%** |
| `docs/internals` | 92 | 42 (45.7%) | 18 | 0 | 18 | 0 | **19.6%** |
| `django/contrib/admin` | 86 | 73 (84.9%) | 67 | 36 | 31 | 0 | **77.9%** |
| `docs/ref` | 76 | 50 (65.8%) | 25 | 0 | 25 | 0 | **32.9%** |
| `django/utils` | 60 | 45 (75.0%) | 35 | 35 | 0 | 0 | **58.3%** |

¹ Subject mentions fix/fixed/fixes, revert/reverted, or hotfix. ² Reviewed fixes exclude reverts and include unlabelled clear repairs. All category boundaries are manual analytical judgments, documented in the commit audit. No hotfix-labelled subjects were found.

- **ORM:** 73 behavior/security repairs plus two in-bucket rollback commits; recurring query correctness work is supported by concrete repair loops, including JSON serialization introduced and later corrected.
- **Utilities:** 35 behavior/security fixes (**58.3%**), mainly external-input parsing, escaping, resource exhaustion, filesystem permissions and async cleanup. The bucket covers several responsibilities, not one repeatedly failing component.
- **Admin:** 67 corrections, but 31 concern UI/accessibility/display/wording. Behavior/security repairs alone are **36/86 = 41.9%**, making its 77.9% total correction share an overstatement of uniform instability.
- **Documentation:** Corrections mainly concern stale instructions, missing caveats, links, and build warnings; these do not establish runtime instability.

### Revert attribution

- ORM: [fb32a564cc](https://github.com/django/django/commit/fb32a564cc), GeneratedField null validation; and [6bbe2656e1](https://github.com/django/django/commit/6bbe2656e1), SQLite compound-query ordering tolerance.
- The test-only companion revert `e7f464ecdc` belongs to the same GeneratedField rollback episode, but lies outside the original 126-commit ORM bucket and is not added to that denominator.
- Coverage-workflow rollback `e4c4a178aa` belongs to **CI**, not internal docs despite accompanying instruction changes.
- ClearableFileInput rollback `79ab0993d0` belongs to **forms**, not admin despite the widget-adapter edit.
- Permission-renaming rollback `030c63d329` belongs to auth/migration integration, outside the top five.
- PK-formatting cleanup `ad073338d0` was already excluded as mechanical maintenance.

Original touch denominators stay unchanged; collateral edits from a revert assigned elsewhere do not become extra rollback events in that area.

## GitHub PR and open-bug context

Authenticated `gh` was available. Read-only API queries found **1,101 PRs closed without merge** during the twelve-month window, regardless of their creation dates. Monthly partitions avoided GitHub Search’s 1,000-result cap. Eligible file paths mapped PRs to the same buckets; bot/mechanical/demo submissions were filtered. Fourteen unusually broad diffs were inspected and assigned to their primary proposal rather than treating imported branch history as genuine coupling everywhere.

| Area | Relevant closed, unmerged PRs |
|---|---:|
| `django/db/models` | **153** |
| `docs/internals` | **35** |
| `django/contrib/admin` | **95** |
| `docs/ref` | **77** |
| `django/utils` | **82** |

These are PR objects, **not rejected bugs** or unique proposals. Duplicate/resubmitted/superseded PRs can appear separately, and a PR may concern more than one area. Example: [#21176](https://github.com/django/django/pull/21176) closed while its rebased replacement [#22025](https://github.com/django/django/pull/22025) merged. Some sampled PRs closed automatically over submission/checklist requirements.

**Open-bug counts are unavailable, not zero.** GitHub Issues is disabled for Django (`has_issues=false`); GitHub’s repository open_issues_count includes PRs and is not a bug backlog. Django uses code.djangoproject.com. Its attempted open-Bug export returned HTTP 403, “Disallowed by robots.txt.” A current backlog snapshot would also be a different population from twelve months of repair commits.

## Authorship / AI caveat

No identifiable bot author identities or AI-agent authors/co-author trailers were found in the selected Git history. Identifiable AI-agent authorship is therefore **0/1,080 before filtering and 0/871 after filtering (0.0%)**. Human-authored translation imports were still filtered based on their mechanical content.

**This does not mean no AI assistance occurred.** During PR inspection, #21176 explicitly disclosed Claude assistance and its replacement was merged. Assistance disclosed in PR bodies is distinct from an agent appearing as Git author/co-author; this session did not quantify the total AI-assisted share.

## Co-change coupling

For coupling only, excluded commits touching **eight or more distinct qualifying area buckets**, leaving **848 of 871** substantive commits. This breadth filter excludes global features as well as sweeps; it does not retroactively remove them from the annual activity ranking. Footprint is measured after the original path/noise filtering, not by changed-line count.

Each commit contributes once to a pair or triple; combinations are inclusive, not exclusive. Pair percentage is the symmetric overlap coefficient:

`shared commits / min(filtered activity of A, filtered activity of B) × 100`.

Both numerator and denominators use the same 848-commit population. This is not a runtime dependency metric, correlation coefficient, or proof of architectural harm.

### Most frequent pairs

| Areas | Shared commits | Smaller denominator | Share |
|---|---:|---:|---:|
| `django/contrib/admin` ↔ `tests/admin_views` | **34** | 44 | **77.3%** |
| `django/utils` ↔ `tests/utils_tests` | **22** | 23 | **95.7%** |
| `django/contrib/gis` ↔ `tests/gis_tests` | **20** | 32 | **62.5%** |
| `django/contrib/auth` ↔ `tests/auth_tests` | **18** | 22 | **81.8%** |
| `django/db/models` ↔ `tests/queries` | **17** | 21 | **81.0%** |

### Most frequent triples

| Areas | Shared commits |
|---|---:|
| `django/contrib/gis` + `docs/ref/contrib/gis` + `tests/gis_tests` | **9** |
| `django/db/models` + `docs/ref` + `tests/invalid_models_tests` | **6** |
| `django/contrib/admin` + `docs/ref/contrib/admin` + `tests/modeladmin` | **4** |
| `django/contrib/admin` + `tests/admin_views` + `tests/modeladmin` | **4** |

### Interpretation for the original top three

- **ORM:** query tests **17/21 = 81.0%**, field tests **16/23 = 69.6%**. The strongest implementation-to-implementation pair is **ORM ↔ database backends: 11/52 = 21.2%**. Subjects concern quoting, ordering, database hooks, UUID functions and data types.
- **Internal docs:** weak, distributed coupling: ORM **5/84 = 6.0%**, utilities **4/49 = 8.2%**, and model reference docs **4/40 = 10.0%**. Subjects concern deprecations, compatibility, and release/calendar-version policy. **57 of 84** retained internal-doc commits touch that bucket alone.
- **Admin:** admin-view tests **34/44 = 77.3%**, changelist tests **11/15 = 73.3%**, ModelAdmin tests **7/7 = 100%** (small sample). Its leading code-only peer is templates **4/14 = 28.6%**, involving validation, annotations and filters. Implementation/test co-delivery is the dominant pattern, not demonstrated harmful coupling.

Sensitivity: cutoffs of ≥6, ≥8, and ≥10 area buckets leave 834, 848, and 856 commits. Admin/admin-view shared counts remain 33, 34, and 34; ORM/query tests remain 16, 17, and 17. Main conclusions are stable, while lower-ranked pairs and exact percentages vary.

## Shared files outside the folder breakdown

For this diagnostic only, restored support-file touches (release notes, credits, configuration/catalog sources) **within the same 848 substantive non-broad commits**. A high area count accumulates across the period, not within one huge commit.

| Shared file | Cohort commits | Different accompanying area buckets | Mechanism |
|---|---:|---:|---|
| `docs/releases/6.1.txt` | **69** | **92** | Maintained release-note prose. |
| `docs/releases/6.2.txt` | **34** | **55** | Maintained release-note prose. |
| `AUTHORS` | **36** | **52** | Contributor credits, explicitly updated by new contributors. |
| `docs/internals/deprecation.txt` | **19** | **33** | Maintained compatibility/deprecation timeline. |

The contribution guide explicitly requires release-note/deprecation entries and asks new contributors to update AUTHORS. Sample patches carry those source-text changes with the feature/fix; release procedures require proofreading. No writer/generator for these source files was found in the searched scripts/workflows. This establishes the documented mechanism, not how each character was entered or whether an author used editing assistance. The main shared cost is editorial review and potential merge contention.

Translation work is different: `scripts/manage_translations.py` fetches `.po` from Transifex, normalizes with `msgcat`, and compiles `.mo` using `msgfmt`; English message catalogs can be extracted with `makemessages`. People may author translations upstream, but import/compilation is tool driven. Four catalog-import commits touched **68, 81, 112 and 115 files**, and were already excluded. A human commit author does not make generated/imported output a hand-edited file.

### Frequently co-changing implementation files: no tests, no .txt

| File | Cohort commits | Different accompanying areas |
|---|---:|---:|
| `django/db/models/fields/__init__.py` | **10** | **18** |
| `django/db/models/query.py` | **19** | **16** |
| `django/db/backends/base/features.py` | **12** | **16** |

The files themselves are runtime implementation; their accompanying-area counts still include tests/docs. These counts are lower than the annual file ranking because broad commits are excluded here.

**Concrete code-only coupling:** `django/db/backends/base/features.py` and `django/db/backends/postgresql/features.py` changed together in **8 commits, 80.0% of the PostgreSQL file’s 10 cohort commits**. This manually maintained capability contract covers UUID functions, Decimal support, boolean lookups and schema-operation capabilities. Base/Oracle feature files also co-change in **5/10 = 50.0%**. These are implementation/compatibility changes, not generated-file churn.

## File liveness and moves

Verified against the analyzed HEAD using both `git ls-tree` and on-disk existence:

- **All ten** original top-ranked files still exist.
- **All four** principal shared-file hubs still exist.
- File-level strong-pair check: ≥5 shared commits and ≥50% overlap against the less active file. Found **14 pairs spanning 21 files**; **all 21 are tracked and present**.
- Audited **922 canonicalized historical file paths** across the broader 871-commit annual cohort. Three no longer exist. Only one of those appears in the narrower 848-commit co-change cohort.

| Historical path | Current disposition |
|---|---|
| `django/contrib/admin/tests.py` | Deleted on 18 August 2026 in `464a5e1844`; admin browser-test infrastructure replaced by `tests/playwright_tests/admin.py` (`AdminPlaywrightTestCase`). |
| `django/test/selenium.py` | Deleted in the same migration; successor infrastructure is `tests/playwright_tests/base.py` (`PlaywrightTestCase`). |
| `docs/topics/external-packages.txt` | Removed on 8 January 2026 in `1717332ca2`; relevant content redistributed to `docs/topics/forms/index.txt` and `docs/topics/i18n/formatting.txt`, with obsolete comments-package content dropped. No single replacement. |

The Playwright migration is a rewrite, not a one-to-one rename; do not treat deleted Selenium helpers as current hotspots. None of the three deleted paths belongs to the strong file-pair set or original Top 10 files. The previously reported leading pairs/triples remain unchanged.

Prior rename consolidation remains valid: `tests/migrations/test_base.py` → `tests/migrations/base.py`; `tests/sphinx/` → `tests/sphinx_tests/`; moved console-tabs stylesheet paths were also consolidated. Current targets exist. Rename detection used Git `-M` (default 50% similarity), so heavily rewritten moves are not guaranteed to be detected automatically.

## Practical reading of the map

- ORM/backend capability boundaries and JSON/query behavior are concrete places to inspect change impact and database-specific coverage.
- Admin’s maintenance burden should be split into permissions/data behavior/security versus UI/accessibility/display refinement.
- Code-to-test coupling is generally evidence of coordinated regression coverage; these counts alone are not an architectural smell.
- Release-note/credit/deprecation files explain broad manual coordination without being runtime dependencies.
- High percentages with small denominators, repair commits for one incident, and superseded PRs must not be interpreted as independent failures.
- This map describes the specified historical checkout. Revalidate paths and counts before applying it to a newer HEAD.

## Detailed session artifacts

These reports and CSV/JSON audits were saved outside the repository in the session visualization directory. This summary is self-contained; the artifacts provide commit-level evidence and reproducibility.

- [Annual methodology and rankings](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/report.md)
- [Monthly counts and campaign evidence](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/monthly_report.md)
- [Monthly CSV](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/monthly_activity.csv)
- [Three-month fix audit](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/recent_bug_fixes.json)
- [Repair classification and GitHub caveats](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/repair_mix_report.md)
- [Commit-level repair CSV](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/repair_mix_audit.csv)
- [GitHub PR mapping and URLs](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/github_pr_area_summary.json)
- [Co-change report and excluded broad commits](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/coupling_report.md)
- [All pair counts](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/coupling_pairs.csv)
- [All triple counts](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/coupling_triples.csv)
- [Shared-file and liveness report](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/shared_files_report.md)
- [Tracked/on-disk liveness CSV](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/file_liveness.csv)
- [Shared-file breadth CSV](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/shared_file_bridges.csv)
- [Original extraction script](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/analyze.py)
- [Original ranking/filter script](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a0b7-cdb8-71a2-a448-4fc2037c6709/git-activity/rank.py)
