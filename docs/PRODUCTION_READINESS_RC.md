# Production readiness — Phase 3 RC

## Release identity

- App version: `2.7.0-rc.1`
- Schedule engine: `4.8.0-rc.1`
- Release channel: RC; not a final store release.

## Build contract

The canonical Pages workflow uses Node 22 and `REQUIRE_MINIFICATION=1`. `scripts/copy-public.mjs` bundles `dist/main.js` and minifies it along with the critical HTML shell's JavaScript and CSS via esbuild. The build must fail if esbuild is not available in a release workflow. `dist/version.json` exposes the content-derived `buildId` and `minified` status. Never publish an artifact where `minified` is false.

## PWA

The manifest uses relative `start_url`/`scope` so the project works as a GitHub Pages project site at `/Zalma/`. PNG icons are provided at 192×192, 512×512 and maskable 512×512. Service Worker network-first navigation and versioned static caches preserve update visibility and allow offline shell startup after first successful visit.

## Android

`capacitor.config.json` wraps local `dist/` assets. Run Actions → **Build Android APK (RC)** after pushing the code. It uses Capacitor 8.5.3, JDK 21 and Android API/build tools 36, runs the full QA gate, builds a debug-signed APK and attaches `Zalma.apk` to the chosen GitHub Release tag. This RC artifact is for sideloaded testing; Play Store distribution requires a protected release keystore, signing secrets, privacy/store metadata, and a separately reviewed release workflow.

## Environment and API origin

The browser app uses relative `/api/...` requests for same-origin API deployment and static snapshot/local-storage fallback. Do not put database credentials or signing secrets into `public/runtime-config.js`; that file is sent to all users. Native APK local assets do not make the Node backend magically available: ticket and server-backed event functions require a deployed HTTPS API and a configured endpoint/reverse proxy.

## Diagnostics and analytics

`public/telemetry.js` captures uncaught errors and unhandled Promise rejections, stores a small redacted local queue, and can send events to an HTTPS `errorEndpoint` if configured. It also supports Google Analytics 4 (`G-…`) and Yandex Metrika IDs through `public/runtime-config.js`. No valid measurement ID, Sentry DSN, or production error-collection URL was supplied for this RC, so remote analytics/error delivery is intentionally disabled by default. Before production, obtain the owner-approved IDs, publish a privacy notice/consent policy as required, configure the telemetry endpoint/IDs and test that no user content or credentials are sent.

## Parser guarantees

- Stream A/B classification prefers the text printed in the PDF heading over a stale filename suffix and logs any disagreement.
- A synthetic Stream A matrix regression fixture verifies layout-generalized parsing and roster coverage (401–412). It represents the matrix parser shape, not official lesson assignments; production events must only be generated from official live documents.
- Consecutive slots are merged for any subject only if program/course/group/stream, date or week/day, type, normalized subject, room, teacher and source match, both slots have plausible durations, and the gap is 0–20 minutes. ORG merges are marked `orgMerged`; other subjects use `mergedConsecutive`. Explicit, differently labelled subgroup halves never merge with each other, and the same half marker is preserved when two consecutive slots are consolidated. Long blocks with unclear identity are kept intact or logged for review rather than silently reinterpreted.

## RC exit criteria

- `REQUIRE_MINIFICATION=1 npm run qa`
- Verify Pages uses GitHub Actions and URL `https://r1vlflow.github.io/Zalma/` (without `/dist/`).
- Verify `dist/version.json` `buildId` matches the settings screen.
- Trigger Android workflow manually; install APK on a test Android device and confirm the APK checksum matches `SHA256SUMS.txt`.
- Test iOS PWA Add to Home Screen in Safari.
- Verify production API URL, remote monitoring IDs, privacy policy and release signing before removing the RC label.
