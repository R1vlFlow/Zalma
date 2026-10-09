# Almazov Schedule Hub 2.3.3

Production-oriented full-stack schedule service for the Institute of Medical Education of the Almazov National Medical Research Centre.

## Why the architecture changed

The old UI represented a week as a mostly fixed matrix of time cells. That made `rowspan/colspan`, merged Excel/HTML cells and incomplete source rows dangerous: one parser mistake could shift an entire day or leak events from another stream.

The new model is **event-first**:

`official source → adapter → normalized event → validation → dedupe → group/stream filter → agenda UI`

The UI never parses an original spreadsheet/HTML/PDF directly. Parsing is isolated in adapters and the browser consumes normalized events.

## Supported education programs

- `31.05.01` Лечебное дело — selector 1–6 courses; verified official schedule sources currently published for all six courses.
- `31.05.02` Педиатрия — selector 1–6; the official student page currently publishes schedule links for courses 1–2. Courses 3–6 remain explicit `unpublished` states until the university publishes them.
- `37.05.01` Клиническая психология — selector 1–6; the official student page currently publishes schedule links for courses 1–2. Courses 3–6 remain explicit `unpublished` states until publication.

The application does not invent missing courses, groups or lessons.

## Features

### Schedule

- agenda layout instead of empty square/time-cell grid;
- weekly navigation and today shortcut;
- mobile day cards; tablet/desktop multi-column agenda;
- program/course/group selectors;
- exact group + stream isolation;
- lecture / practice / lab / assessment filters;
- search by subject, room, teacher or stream;
- `1/2` and `2/2` preservation;
- semantic deduplication independent of source `id`;
- empty, partial, cached and unavailable states;
- skeleton during loading;
- ICS export, print and shareable profile URL.

### Parsing pipeline

Adapters are separate and replaceable:

- official JSON adapter;
- PDF text/coordinate adapter;
- XLSX/XLS adapter with merge expansion;
- HTML table adapter with `rowspan` / `colspan` reconstruction.

Normalization covers:

- discipline names;
- teacher names;
- locations and room prefixes;
- group IDs and ranges;
- A/B stream labels, including Cyrillic variants;
- lesson types;
- time ranges with `:` or `.` separators;
- half-term labels `1/2`, `2/2`, `числитель`, `знаменатель`;
- week specifications such as `(2-5, 7)`.

No date is invented from “today”. A record without a trustworthy date/week is quarantined or skipped.

### User experience

- dark / light / system theme;
- inline boot theme script prevents FOUC;
- persisted theme preference;
- FAQ accordion + search;
- quick glossary for `1/2`, `2/2`, streams and PZ;
- dashboard with upcoming lessons;
- local homework/task storage scoped by program/course/group;
- PWA shell and offline page;
- keyboard-focus styles, labels and semantic dialogs.

### Caching and reliability

Browser: in-memory → IndexedDB → localStorage fallback.

Server: in-memory → Redis when `REDIS_URL` is configured → atomic disk snapshots. Redis is optional; the service remains fully functional without it.

A failed remote fetch never replaces a valid snapshot with empty or malformed data.

## Run locally

```bash
npm install
npm run qa
npm start
```

Open `http://127.0.0.1:4173`.

## Synchronise official sources

```bash
npm run sync
```

This command fetches published official sources, parses them through adapters, validates output and stores atomic snapshots under `storage/snapshots/`.

## Production deployment

### Static-only

`npm run build` creates `dist/`. Static-only mode is supported for the frontend; full multi-program parsing/import requires the Node server.

### Full-stack (recommended)

Run `npm start`. The same process serves `dist/` and `/api/schedule`.

Environment:

- `PORT` — HTTP port (default `4173`)
- optional `REDIS_URL` — Redis cache for parsed schedule payloads
- optional `HOST` — bind address (defaults to `0.0.0.0` for container-friendly deployment)

## Data quality guarantees

Before an event reaches the UI it must have:

- supported program and course;
- valid ISO date;
- valid start/end time;
- non-empty subject;
- normalized group/stream;
- dedupe identity.

Stream-specific `ALL` events are only visible to groups in the same stream. Exact group events are only visible to the exact group.

## Current official-source caveat

The university's electronic schedule page explicitly warns that its schedule is published in test mode and may not reflect completed rescheduling. The Hub therefore shows source status rather than pretending its data is authoritative when the source is stale or unavailable.

The official student cabinet currently publishes specialist schedule links for 31.05.01, 31.05.02 and 37.05.01. The public page currently exposes Peds/Psych schedule links for courses 1–2, while LD is exposed through course 6. The UI keeps 1–6 selectable for future publication, but unpublished courses remain explicit unavailable states and are never populated with guessed events.

## Repository structure

```text
src/
  app.ts
  core/          normalization, calendar, filtering, parsers, validation
  data/          program and official source catalog
  services/      cache, schedule, tasks
  ui/            theme and FAQ
server/
  server.mjs
  pipeline.mjs
  pdf-adapter.mjs
  xlsx-adapter.mjs
  html-adapter.mjs
  source-registry.mjs
  redis-cache.mjs
config/
docs/
tests/
public/
scripts/
```

## Production release checks

`npm run qa` runs TypeScript checks, build/distribution validation, parser unit tests, project checks, Node syntax checks and HTTP runtime smoke. The suite includes merged-cell HTML/XLSX fixtures, PDF coordinate fixtures, week/date normalization, stream isolation, deduplication, split 1/2 and 2/2, malformed-record validation, all 18 program/course selectors and a 10,000-event filter stress case.

Before deployment, also run `npm run sync` against the current official sources and review the generated snapshot validation report. `npm run sync` never replaces a valid snapshot with empty/malformed data. The browser QA harness is separate from the deterministic parser test suite because some sandboxed CI environments cannot launch Chromium reliably.

## Quality checks

```bash
npm run typecheck
npm test
npm run validate
node --check server/server.mjs
node --check server/pipeline.mjs
node --check server/pdf-adapter.mjs
node --check server/xlsx-adapter.mjs
node --check server/html-adapter.mjs
```

## Important non-goals

The service never fabricates official schedule data for unpublished courses. When an official document is missing or internally identifies the wrong specialty, it is quarantined and the UI directs the student to the original official page.

## QA 2.2.0 hardening

The 2.3.0 release adds a parser regression guard for the second common table orientation: **group-per-row + day-per-column**. HTML tables are now classified before semantic extraction so a data-row group cannot be mistaken for a group header column. Day dates are taken from the day header instead of room numbers such as `2.11`, preventing the exact date-shift bug that can move a lesson into another week. Leading separators left behind after time/type removal are also normalized.

The release test suite currently contains 17 deterministic tests covering merged cells, both HTML orientations, stream isolation, group isolation, date/week normalization, semantic dedupe, split weeks, malformed data, PDF coordinates, XLSX merge alignment and a large filter stress case. `npm run qa` passes in the provided environment.

A browser-origin E2E run remains environment-dependent when Chromium is sandboxed; deterministic parser and UI-source validation are therefore kept separate from the browser smoke layer.

## GitHub Pages deployment

The `.github/workflows/pages.yml` workflow runs on source-code pushes to `main`/`master`, executes `npm run qa`, and deploys the contents of `dist/` to the repository-root Pages URL. `.github/workflows/sync-official-schedules.yml` is the separate scheduled/manual official-data refresh workflow (every 6 hours). The two workflows share a non-cancelling concurrency group so a code deployment and a schedule refresh cannot cancel each other. With GitHub Actions as the Pages source, use the Pages URL without `/dist/`. For a server deployment, use `npm start` or Docker; Redis is optional.

## 2.3.0 production hardening

The static release includes versioned assets, a network-first service worker, official schedule snapshots, timeout-bounded data requests, and split-part labels in every calendar view. The source-deployment workflow runs QA; scheduled/manual source sync runs its own parser regression suite before publishing.

## Dependency lockfile

The repository intentionally uses `npm install` rather than `npm ci` because this delivery environment cannot reach the public npm registry to generate a complete `package-lock.json` with exact integrity metadata. Do not commit a hand-written or incomplete lockfile. On GitHub, `npm install` resolves the declared package ranges normally.


## 2.3.1 — browser cache and deployment freshness

- The build creates a content-derived `buildId` and adds it to CSS, JavaScript entry points and every generated ES-module import.
- The service worker uses network-first navigation/data requests, pre-caches only build-versioned assets, removes old app cache generations, checks updates without the browser HTTP cache, and reloads already-open tabs after activation. User-specific `/api/` responses are not stored in Cache Storage.
- `dist/version.json` exposes the deployed `buildId`; Settings displays the current fingerprint and includes **Check for updates**.
- Root-level `index.html` is now a compatibility redirect to the canonical `dist/` build when Pages is mistakenly configured to publish the repository root. GitHub Actions remains the recommended Pages source.
- Added a cache-invalidation QA gate covering versioned imports, service-worker strategy, runtime version verification and the root deployment bridge.
