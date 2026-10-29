# Implementation review fixes

## F1 — Overlapping chart hit areas

- Status: FIXED (2026-10-29), explicitly approved during triage.
- Pointer selection now resolves the nearest observation by SVG time-axis position rather than the topmost overlapping circle; keyboard focus/Enter/Space remain per point.
- Regression: 365 flat observations at mobile width; interior tap, hover and keyboard selection. Hide Astro development toolbar so it cannot intercept the test coordinates.
- Validation: astro sync, lint, astro check, build, 282 unit tests, and 2 Playwright tests including setup passed. Formatting and diff whitespace checks passed.

## F2 — Chart sizing after empty ranges

- Status: FIXED (2026-10-29), explicitly approved during triage.
- ResizeObserver watches the persistent history section rather than the conditional SVG.
- Browser coverage: initially empty default range → All, populated → empty → populated, and mobile viewport resize.
- Validation: astro sync, lint, astro check, build, 282 unit tests and 2 Playwright tests including setup passed.

## F3 — Counted zero-price demo sale

- Status: FIXED (2026-10-29), explicitly approved during triage.
- Position index 4 now has zero sell price, quantity 10, a sale date and no deletion timestamp.
- Literal oracle: five realised gains of 100 minus zero-sale loss of 500 = 0 across six counted positions.
- Validation: 2 demo tests, astro sync, lint, astro check, build and 282 unit tests passed.
- Existing seeded data is preserved on normal reruns; adopting changed fixtures requires the explicit documented demo reset.

## F4 — Manual acceptance evidence

- Status: FIXED (2026-10-29), explicitly approved during triage.
- Reopened manual Progress checks 2.3, 3.2 and 4.3; verification notes now distinguish automated coverage from pending human inspection of the seeded demo.
- Validation: confirmed all three checkboxes are unchecked and verification notes identify each remaining acceptance task. Documentation-only change.
