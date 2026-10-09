# Browser cache and deployment invalidation — 2026-10-09

## Root causes found

1. The installed Service Worker used a cache-first strategy for every same-origin static asset. HTML, CSS and JavaScript could therefore remain old after a deployment.
2. The cache generation used a manually maintained release string. Publishing code changes without changing that string did not invalidate the old cache.
3. HTML referenced stable `styles.css`, `boot.js` and `main.js` URLs, and compiled ES modules referenced stable relative module URLs.
4. The repository contained two application entry points: an old root `index.html` and the canonical `public/index.html` compiled to `dist/index.html`. GitHub Pages configured to publish the root of a branch could serve the old application.

## Implemented safeguards

- `scripts/copy-public.mjs` calculates a 64-bit hexadecimal prefix from the built app, static data, source version metadata and build generator.
- `dist/version.json` publishes this `buildId`.
- The build ID is appended to CSS, JavaScript entry points, every generated relative ES-module import and the manifest URL.
- The Service Worker cache is named by build ID. It pre-caches only immutable, versioned resources, applies network-first to navigation and unversioned data, and deletes older app cache generations on activation.
- API responses and build-version metadata are not stored in Cache Storage.
- The app requests a Service Worker update with `updateViaCache: 'none'`, compares the deployed `version.json` on each launch, and navigates to a cache-busted URL when a newer build is found.
- Settings displays the active build ID and provides a manual **Check for updates** action.
- The root `index.html` redirects branch-based Pages deployments to `dist/` as a compatibility fallback. **GitHub Actions remains the recommended Pages source.**
- QA checks the generated IDs, module query strings, worker strategies, build metadata, and root deployment bridge.

## Deployment verification

1. Commit/upload the project contents, including `.github/`, `src/`, `public/`, `scripts/`, `package.json` and the newly built `dist/` folder.
2. In GitHub, open **Settings → Pages → Build and deployment** and select **GitHub Actions**.
3. In **Actions**, confirm the newest `Deploy GitHub Pages` or `Sync official schedules and deploy` run completed successfully. A commit alone is not evidence that Pages has deployed its artifact.
4. After opening the site, go to **Settings → Check for updates**. The displayed build ID should match the `buildId` in the deployed `dist/version.json`.
5. If the build ID in the live app differs from the latest artifact, the issue is in the Pages deployment/source selection rather than the browser's local cache.

The update process clears only obsolete application Cache Storage entries. It does **not** clear localStorage or IndexedDB, so user settings, tasks and local data are not intentionally erased.
