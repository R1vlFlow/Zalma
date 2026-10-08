# Implementation Status — 2026-10-08

## Completed in this hardening pass

### Schedule data integrity

- Replaced inline hard-coded LD group ranges in `src/app.ts` with `src/data/roster.ts`.
- Aligned LD group matrices with `data/official-roster-contract.json`.
- Restored 4th-course group `424` and 6th-course groups `617–618` in the selector model.
- Enforced that course 6 has no A/B stream in `streamForGroup()`.
- Preserved double-lesson metadata through validation and live normalization.
- Rendered double lesson parts as explicit `1/2` and `2/2` when `half` is absent.
- Added independent color controls for `1/2` and `2/2` in the profile appearance settings.

### Static/GitHub Pages resilience

- Fixed `scripts/copy-public.mjs` so copying public assets no longer deletes compiled `dist/data/*.js` modules.
- Added copying of `public/boot.js`.
- Added bundled official LD 1–6 snapshot generation into `dist/data/schedules/` from `data/official-schedules.json` so static fallback remains useful when API/live fetch is unavailable.
- Added missing `scripts/validate-project.mjs` and `scripts/smoke-server.mjs` required by the canonical QA command.
- Moved GitHub Actions workflow definitions to `.github/workflows/`.
- Added canonical `sync-official-schedules.yml` workflow for scheduled sync, regression tests, build, validation and Pages deployment.

### Release consistency

- Set project version to `2.3.0` consistently in the active build/release metadata.
- Updated the schedule builder user-agent to the current engine version.
- Reworked release/static validation scripts to target the current `public/` + `src/` architecture rather than obsolete root-level artifacts.

### Tests / validation

The current hardening pass verifies:

- TypeScript strict typecheck.
- Node unit/integration tests.
- Schedule parser regression fixtures for 4K/5K/6K.
- Double-lesson/bookmark contract.
- Schedule coverage contract (20/20).
- Generated index and schedule data validation.
- Workflow contract validation.
- Static project QA.
- Build/dist integrity.
- Backend smoke tests.

## Not implemented yet

The requested new platform modules are **not** claimed as implemented because they require a real product/backend layer that is absent from the supplied repository:

- server-side authentication and sessions;
- Super Admin/Admin/Manager/Employee/Client/Viewer RBAC;
- persistent User/Calendar/Event/Task/Project/Team/Notification/etc. database models;
- full Day/Week/Work Week/Month/List/Agenda calendar engine with recurrence, attendees, reminders, timezone and conflict workflows;
- complete Dashboard widget configuration;
- projects/team/clients modules;
- email/push notification service;
- support ticket system;
- FAQ administration;
- external calendar/video/chat integrations;
- global search across entities;
- GDPR account export/deletion workflows backed by the server;
- full API-level security layer for those future modules;
- dedicated ESLint/Playwright/Vitest-style test stack (the current deterministic Node/Python QA remains active).

## Migration

There is no database migration for this hardening pass because the supplied application currently has no production database schema.

When server persistence is introduced, migrations should be added before switching user-facing data from local storage to server persistence.

## Environment

Current schedule API can run with Node. Redis remains optional. No OAuth/email/storage credentials are required for the hardening changes themselves.

## Known limitations

- Upstream official-source synchronization cannot be fully verified against the live internet from the local development environment; CI is responsible for scheduled upstream refreshes.
- Some programs/courses remain intentionally unpublished because the current official source contract does not provide them.
- The repository still contains historical scripts from earlier releases; the canonical QA path now targets the current source architecture.

## Next phase

The next implementation phase should start with extracting a reusable design system and a proper calendar/event domain, then introduce authentication + RBAC + persistence before adding collaboration and third-party integrations.
