# Production hardening plan

## Phase 1 — correctness (implemented)

1. Flatten all source formats into normalized events.
2. Expand HTML `rowspan/colspan` and XLSX merges before semantic parsing.
3. Normalize names, groups, streams, types, dates and time ranges.
4. Require trustworthy date/time; never fall back to the current week.
5. Dedupe by semantic identity, not source ID.
6. Enforce program/course/group/stream isolation before rendering.
7. Quarantine source-specialty mismatches.

## Phase 2 — UX (implemented)

1. Replace large empty time grid with agenda columns/cards.
2. Mobile-first day cards under 680px.
3. Tablet two-column agenda and desktop seven-column agenda.
4. Dark/light/system theme without FOUC.
5. Skeleton, cache, unavailable and partial data states.
6. FAQ accordion/search and glossary.
7. Dashboard, tasks, calendar export, sharing and print.

## Phase 3 — backend (implemented)

1. `/api/schedule` endpoint.
2. Source adapter pipeline.
3. Atomic disk snapshots.
4. Optional Redis cache adapter.
5. Safety limits and path traversal protection on HTTP server.
6. Local file import endpoint for PDF/XLSX/HTML candidate parsing.

## Phase 4 — operational hardening

1. GitHub Pages scheduled deployment with source sync and QA.
2. Browser E2E remains a separate real-Chromium job because sandboxed environments can be unstable.
3. Add source change notifications and parser confidence thresholds.
4. Add signed snapshot metadata and optional database persistence.
5. Add multi-device authenticated task sync if required.
