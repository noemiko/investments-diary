# Django contributors — engagement candidates

Prepared: **3 November 2026**.

## Scope and method

This analysis covers **3 November 2025–3 November 2026**, using the same committer-timestamp window and analyzed HEAD, `b501b8493f31cf8cba31211d59b3b78642b8cb02`, as the [territory map](artifact-1-territory.md) and [structure map](artifact-2-structure.md).

The five engagement priorities are ORM, database backends, admin, shared utilities, and GeoDjango. Counts represent substantive, non-merge commits authored by each person that touched the implementation area, rather than reviews or overall contributions. A commit can count in multiple areas. Topic descriptions summarize authored changes; they do not establish ownership or availability.

- Reused the territory map's substantive-commit filtering, then excluded dependency-only maintenance affecting admin and GeoDjango.
- Checked author identities for bots and AI agents, including Claude, Codex, and Copilot. No identifiable AI-agent authors or AI-agent co-author trailers were found in the analyzed window. This does not establish that no AI assistance occurred.
- Human-authored commits remain eligible regardless of AI co-authorship; only primary authors receive the counts below.
- Consolidated confirmed identity variants through case-normalized names and shared author-email identities. Historical shared identity also confirms Natalia Bidart's name. Email addresses are not included in this report.
- Preserved credited handles where a fuller name was not established. Unconfirmed identities were not merged merely because their names resemble one another.

**Jacob Walls has the broadest activity across the five areas**, while other contributors show focused experience in JSON lookups, backend contracts, admin accessibility, parsing, and spatial libraries.

## ORM — `django/db/models`

**126 qualifying commits; 48 consolidated author identities.** Listed contributors authored at least four commits, with two additional focused specialists.

| Contributor | Commits | Topics indicating potential support |
|---|---:|---|
| Jacob Walls | 19 | Query ordering and aliases; primary-key defaults; UUID preparation; SQL-injection prevention |
| Clifford Gama | 13 | JSONField lookups across databases; NULL handling; expression preparation; field checks |
| Mariusz Felisiak | 11 | Many-to-many manager hooks and signals; DecimalField; model checks; bitwise aggregates |
| Simon Charette | 7 | SQL identifier quoting; NULL/boolean semantics; constraints; compiler and placeholder APIs |
| Adam Johnson | 6 | Model compatibility; field/default performance; constraint validation; `select_related()` deprecation |
| Vignesh Anand | 5 | Query ordering; JSON numeric expressions; SQLite decimal precision; cursor handling |
| Tim Graham | 5 | ORM/backend feature contracts; pattern lookups; truncation hooks; database deletion capabilities |
| Yassin Bahri | 4 | Tuple lookups; annotations; iterator handling; prefetch routing hints |
| Nilesh Kumar Pahari | 4 | Ordering after unions; `first()`/`last()` behavior; field initialization; GeneratedField checks |
| Keryn Knight | 3 | Prefetch performance and avoiding QuerySet cloning |
| JaeHyuck Sa | 3 | Expression-based lookups; Oracle empty-string semantics; QuerySet error messages |

## Database backends — `django/db/backends`

**55 qualifying commits; 26 consolidated author identities.** The table includes the leading authors and contributors with focused backend compatibility or validation work.

| Contributor | Commits | Topics indicating potential support |
|---|---:|---|
| Jacob Walls | 7 | Oracle driver compatibility; backend test capabilities; PostgreSQL alias security |
| Tim Graham | 7 | Backend extension hooks; feature flags; test-database lifecycle; introspection contracts |
| Mariusz Felisiak | 5 | Oracle GeneratedFields; DecimalField support; PostgreSQL introspection; supported versions |
| Simon Charette | 5 | Identifier quoting; SQL placeholders; SQLite boolean behavior; PostgreSQL bulk-insert correctness |
| Clifford Gama | 4 | Schema alterations; many-to-many renaming; Oracle JSON indexing |
| JaeHyuck Sa | 3 | PostgreSQL parameter limits; bulk-batch sizing; schema documentation |
| Sarah Boyce | 2 | SQLite decimal conversion; `sqlparse` compatibility |
| Adam Johnson | 2 | SQLite expression-support validation and performance |

These are candidates for backend consultation. Their activity does not establish expertise in the specific initialization cycles identified by the structure map.

## Admin — `django/contrib/admin`

**85 qualifying commits after excluding a dependency-maintenance commit; 48 consolidated author identities.** Listed contributors authored at least three qualifying commits.

| Contributor | Commits | Topics indicating potential support |
|---|---:|---|
| Jacob Walls | 12 | `list_editable` security; related-field display; deletion confirmation; form and changelist layout |
| SiHyunLee | 7 | Inline/widget styling; form labels and errors; select icons; empty-value display |
| Adam Johnson | 6 | Changelist search; malformed popup parameters; related-object loading; performance |
| Natalia Bidart | 3 | Safe link rendering; consistent permission failures; change-form action querysets |
| Skyiesac | 3 | Keyboard focus; calendar/clock accessibility; accessible labels |
| Artyom Kotovskiy | 3 | Per-object permissions in `list_editable`; form submission; formset saving |

Admin support should follow the topic: permission and data behavior work draws on a different contributor set from accessibility and layout work.

## Shared utilities — `django/utils`

**60 qualifying commits; 30 consolidated author identities.** The table includes the leading authors and contributors with focused utility work.

| Contributor | Commits | Topics indicating potential support |
|---|---:|---|
| Natalia Bidart | 13 | Header parsing; resource-exhaustion protection; filesystem permissions; HTML truncation; CSP; deprecations |
| Jacob Walls | 8 | Cache-header parsing; XML attribute safety; cache-key construction; Python introspection and async compatibility |
| Mike Edmunds | 4 | Deprecation helpers; callable-signature inspection; MAILERS integration |
| Varun Kasyap Pentamaraju | 4 | Duration parsing; autoreloader exceptions; stylesheet escaping; URL-length handling |
| Sarah Boyce | 3 | Translation-cache exhaustion; CSP helper placement; deprecation warnings |
| Jacob Rief | 2 | Migration from Django's `cached_property` to `functools.cached_property` |
| Pravin Kamble | 2 | Header-parser performance; safe-string handling |

Natalia Bidart is the strongest initial contact for input-handling work in this period. The utilities package spans many responsibilities, so its overall author count does not describe the support available for each individual helper.

## GeoDjango — `django/contrib/gis`

**32 qualifying commits after excluding an OpenLayers dependency update; 15 consolidated author identities.** The table includes the leading authors and two contributors with focused spatial-input work.

| Contributor | Commits | Topics indicating potential support |
|---|---:|---|
| Jacob Walls | 13 | Raster and geometry security; nested collections; GDAL memory safety; network-raster lifecycle; database compatibility |
| David Smith | 4 | GEOS initialization bindings; coordinate dimensions; spatial functions and lookups |
| Mariusz Felisiak | 2 | GDAL, PostgreSQL, and PostGIS support boundaries |
| Simon Charette | 2 | Spatial SQL operations; transformation decisions; placeholder APIs |
| Sarah Boyce | 1 | Rejecting unsafe byte inputs in spatial lookups |
| Yassin Bahri | 1 | Spatial transforms for fields without an SRID |

Jacob Walls authored **13 of 32 commits (41%)**, making him the clearest initial contact for recent spatial safety work. GeoDjango's engagement priority comes from the territory map; the structure analysis did not inspect its cycles.

## Team size and interpretation

The author totals describe a contributor pool, not the current support team. Availability, review activity, and knowledge held by people who did not author commits are not measured here. A broad annual pool can coexist with a small specialist group for a particular topic.

Knowledge concentrated in one person is normal in an active specialist group of two or three people. These commit counts alone do not establish a knowledge-concentration risk. Such an assessment would need the actual active team size, review participation, and evidence about who else can support the topic.

## Supporting audit

The complete audit lists every qualifying author and supporting commit links, without email addresses. Supporting files are stored outside the repository:

- [Complete contributor and commit listing](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a152-80f8-7bf2-a1e9-3c6f93cd92fb/contributors/contributors.md)
- [Sanitized commit audit and additional exclusions](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a152-80f8-7bf2-a1e9-3c6f93cd92fb/contributors/audit.json)
- [Contributor extraction script](/Users/noemi.kowalewska/.codex/visualizations/2026/11/03/01a1a152-80f8-7bf2-a1e9-3c6f93cd92fb/contributors/analyze.py)
