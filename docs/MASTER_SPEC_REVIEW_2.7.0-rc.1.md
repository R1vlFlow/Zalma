# Master specification review — Zalma 2.7.0-rc.1

Date: 2026-10-10

## Implemented in this archive

- Replaced day/week/work-week absolute vertical time-grid output with responsive day cards. Each card contains the event time range, subject, room, teacher, status, subject colour and homework action.
- Removed the unused legacy absolute-position event renderer and its inaccessible resize handler.
- Generic consecutive-slot consolidation for same-identity events, requiring same program/course/group/stream/date-or-week/day/type/subject/room/teacher/source and a 0–20 minute gap between plausible 45–130 minute slots.
- Merge provenance survives backend and frontend normalization so legacy long blocks do not get split a second time.
- Explicit `doubleIndex` / verified series parts retain `1/2` and `2/2`; distinct half assignments are never merged with each other. A source `half` marker is preserved during consolidation.
- Stream A/B parsing prefers document headings over filename hints, reports mismatches and has a Stream A regression fixture for groups 401–412.
- Added/updated tests for frontend/server consolidation, explicit halves, continuous official blocks, card UI and release contracts.
- Added `.gitignore` protection for runtime snapshot databases, local env files, Python caches, node_modules and generated Android artefacts.

## QA result

`npm run qa` completed with exit code 0 on this source tree. The final gate included strict TypeScript, lint, production TypeScript build, 74/74 Node tests, cache invalidation, deployment contract 8/8, KUG contract 12/12, CI consistency 7/7, schedule coverage 20/20, parser regression tests, RC contract 17/17, theme contrast, HTTP acceptance, release validation and server smoke.

Final local build ID: `d2156d5018346a2e`.

## Explicit limitations

- This environment has no installed `esbuild` and no cached npm packages for it. The local `dist/version.json` therefore reports `minified: false`. Release GitHub Actions require minification and must be allowed to install dependencies and complete successfully before publishing this RC. Do not publish the local unminified bundle as final production output.
- No APK is included. Android workflow builds a debug-signed APK in GitHub Actions; installation on a real Android device and iOS Safari Add-to-Home-Screen still require manual release acceptance.
- A real Chromium visual E2E did not complete in the provided environment. CSS contracts and structural tests passed, but they do not replace visual checks at 320px, 430px, tablet, desktop and 4K.
- The Stream A PDF regression fixture is synthetic and verifies parser structure, not real assignment data. Production official snapshots must be refreshed from the official website workflow before claiming current Stream A parity.
- Multi-device synchronization requires a deployed authenticated API/backend; browser profile/preferences/materials remain local to the current browser unless the app is configured for server sync.
