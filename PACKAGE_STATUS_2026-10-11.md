# Full project package — 2026-10-11

- Application package: `almazov-schedule-hub` `2.8.0-rc.4`
- Schedule engine: `5.0-universal` in the sync status; `4.9.0-rc.1` remains the version documented in historic release notes.
- Package purpose: complete source/project handoff, including application code, backend, public UI/PWA assets, generated `dist`, current local schedule/KUG data, official source manifests, migrations, scripts, automated tests, PDF/HTML fixtures, workflows, snapshot data and audit reports.
- Packaging exclusions: `.git`, `node_modules`, Python bytecode/cache, and OS-specific `.DS_Store` files only. No real `.env` file is included; `.env.production.example` is a template.

## Local verification performed

`npm run qa` completed with exit code 0 on 2026-10-11. Checks included TypeScript/lint, build + dist integrity, JavaScript test suite, parser and schedule regressions, cache invalidation, deployment contracts, KUG data contracts, source discovery, coverage contracts, accessibility contrast, HTTP acceptance, production workflow contracts, recovery snapshot integrity and server smoke tests.

The generated local `dist` build identifier from that run is `2d9a28b1af854a53`. It is not minified: the local run explicitly reported `RC MINIFICATION SKIPPED` because `esbuild` is not installed in this execution environment. Release workflows require the minified build.

## Production status — BLOCKED_FOR_PRODUCTION

This package is complete as a project handoff, but is not certified as a production release. The last live official sync failed before source bytes were downloaded because DNS resolution for `education.almazovcentre.ru` failed in this runtime. Therefore no SHA-256 values were verified against freshly downloaded official PDFs, schedule snapshots remain explicitly marked as local recovery, and `reports/production-release-audit.json` remains blocked. Known gaps include missing direct practice assignments in the local snapshot for LD group 103, groups 217–222 and 225–229, groups 501–512, and groups 601–618; course 2/B has only a partial cached dataset, course 5/A has not been parsed into accepted assignments, and course 6 practice PDF is quarantined due to a corrupt local text layer. The public KUG hub has 10 published programme/course documents out of 17 anticipated combinations.

Do not publish the recovery snapshot as live/complete. Run `npm run sync:official` in a network-enabled environment, verify raw PDF SHA-256/provenance and academic-week conflicts, rebuild specialist snapshots, pass `python3 scripts/validate_production_release.py`, and run `npm run build:rc` before deployment. Production publication must remain denied until the production gate reports zero errors.

## Entry points

- Start here: `README_FIRST.md`
- Setup/build/test: `README.md`, `package.json`
- Official sync/release process: `docs/PRODUCTION_SYNC_AND_RELEASE.md`, `.github/workflows/sync-official-schedules.yml`
- GitHub Pages workflow: `.github/workflows/pages.yml`
- Android build workflow: `.github/workflows/android-apk.yml`
- Current audits: `reports/`
