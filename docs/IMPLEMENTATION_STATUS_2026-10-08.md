# Implementation Status — 2026-10-08

## Implemented and verified in this pass

### Schedule / calendar

- Fixed `weekly-block` official records by materializing dates from `weekStart + matrixSlots`.
- Fixed 4–6 course normalization and preserved exact official group roster, including 424 and 617–618.
- Added explicit split of 185/205-minute double practicals into `1/2` and `2/2` with a 15-minute break.
- Preserved double-part metadata through server and client normalization and semantic dedupe.
- Added Day, Work Week, Week, Month, Agenda and List views.
- Added real loading skeleton, empty and error states.
- Added current-time line, today highlighting, weekend-aware week strip and mobile event list.
- Added personal event CRUD through the Node API with browser fallback.
- Added drag-to-day and resize interactions for personal events plus undo for single-event changes.
- Added recurring daily/weekly/monthly/yearly series and edit scopes: single, following, series.
- Added all-day strip, multi-day segment rendering, conflict warning, categories and statuses.
- Fixed UTC canonicalization: API stores and returns ISO UTC instants; display uses an explicit IANA timezone.
- Added DST tests for Zurich summer/winter offsets and cross-timezone rendering.
- Added API validation for malformed timezone, ranges and event timestamps.
- Added versioned schedule snapshots and versioned Redis entries so old normalization results cannot silently replace current data.

### FAQ / support

- FAQ is a real searchable/category-filtered centralized data source with popular articles and support CTA.
- Support has a real API-backed ticket flow with subject/category/priority/description, history, user replies and attachments.
- Attachments are size-limited, stored outside the database and ownership-protected at download time.
- Support state automatically moves from `waiting_user` to `in_progress` when the user replies.

### Theme / UI

- Added semantic CSS tokens for backgrounds, surfaces, text, borders, focus, status, calendar and shadows.
- Added Light / Dark / System theme mode with pre-boot theme selection to prevent FOUC.
- Added visible focus states, skip link, reduced-motion handling and mobile touch targets.
- Added responsive desktop/tablet/mobile layouts without introducing a second UI framework.

### QA / release

- Added a repeatable lint gate for runtime code (strict TypeScript + temporary marker/console-log checks).
- Added HTTP acceptance coverage to the project QA command.
- Added production `dist` tests that verify normalized 4K double parts survive the build.
- Updated deployment and environment documentation.

## Still intentionally limited

These capabilities are not simulated because the current repository still has no real identity provider or shared-account domain:

- server-authenticated login/session management;
- secure Super Admin/Admin/Manager/Employee/Client/Viewer RBAC;
- shared teams/users/clients/project collaboration;
- email/push notification delivery;
- Google/Outlook/Apple/Zoom/Teams/Meet/Slack OAuth integrations;
- global cross-entity search;
- admin-side FAQ CMS;
- GDPR account export/deletion workflows tied to authenticated accounts.

The current API ownership model uses the SPA's `x-user-id` client identifier. This is deliberately documented as a limitation and must not be treated as production-grade authentication for untrusted multi-user deployments.
