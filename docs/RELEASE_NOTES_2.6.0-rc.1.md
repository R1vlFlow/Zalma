# Zalma 2.6.0-rc.1 — Phase 3 release candidate

## Added
- Installable PWA manifest, maskable icons, install prompt and offline shell cache.
- Capacitor Android wrapper configuration and GitHub Actions pipeline that builds a debug-signed APK and attaches it to the RC release.
- Android/iOS installation FAQ and app-install dialog.
- Client diagnostics with bounded local error/event queues; optional GA4, Yandex Metrika and HTTPS error endpoint support.
- Stream classification follows the visible PDF heading when it conflicts with a filename and emits an anomaly warning.
- ORG consecutive-slot merge is marked in the source JSON and preserved as one continuous event by both server and frontend normalizers.
- Parser, deployment, minification and RC-contract tests.

## Release requirements
- Configure GitHub Pages to publish through Actions at the project root (not `/dist/`).
- Run the official schedule sync workflow after publishing the parser update so Stream A data is regenerated from current source PDFs. The A-stream regression PDF included in tests is synthetic and is never used as production schedule data.
- The Android workflow must finish before the APK Release URL is available. APK is debug-signed for RC sideloading, not for Play Store publication.
- The local workspace had no Android SDK/Gradle and could not install npm packages due a network timeout; therefore no compiled APK or locally minified artifact is represented as already built. CI workflows require minification and will fail closed if esbuild is missing.
- Remote analytics/error delivery remain disabled until owner-approved IDs/endpoints and any required consent/privacy settings are configured.
