# Almazov Student — Architecture Audit — 2026-10-08

## Scope

Аудит выполнен по исходному репозиторию `Zalma-main` после анализа предварительного release-архива.
Цель — определить реальную архитектуру перед масштабной переработкой платформы и устранить блокирующие регрессии без полного переписывания приложения.

## Current architecture

- Frontend: TypeScript 5.8, strict mode, browser SPA без React/Vue/Angular.
- Build: `tsc` → `dist/` → `scripts/copy-public.mjs`.
- UI source: `src/app.ts`, `src/ui/*`, `public/index.html`, `public/styles.css`.
- Backend: Node ESM HTTP server в `server/server.mjs`.
- Schedule pipeline: PDF/XLSX/HTML adapters → normalization/validation → semantic deduplication → static/Redis snapshots.
- Persistence: profile/tasks/preferences — browser storage; materials — IndexedDB; серверной БД и аккаунтов в текущем исходном репозитории нет.
- Deployment: GitHub Pages/static fallback + optional Node API.

## Important architectural observations

1. `src/` является актуальным исходным кодом; старые root-level `index.html`, `styles.css`, `app.js` не следует считать canonical deployment source.
2. `public/index.html` и `src/app.ts` должны рассматриваться как UI contract для текущей версии.
3. Official schedule data имеет отдельный source layer: `data/official-schedules.json` и `data/official-roster-contract.json`.
4. The schedule domain already has a robust parser/normalizer pipeline and regression fixtures; it should be extended, not replaced.
5. Course 6 is explicitly no-stream in the official roster.
6. Double lessons are represented as separate events and must not be semantically deduplicated across `1/2` and `2/2`.

## Blockers for the requested platform expansion

The current repository does **not** contain:

- production authentication/session service;
- User/Role/RBAC database model;
- server-side user/calendar/task persistence;
- notification service with email/push channels;
- support ticket service;
- FAQ administration backend;
- Google/Microsoft/Apple/Zoom/Teams/Meet/Slack OAuth integrations;
- global cross-entity search index;
- audit-log persistence;
- database migrations.

These capabilities must be introduced as explicit product/backend modules. They must not be simulated with client-side flags or localStorage because that would not provide real authorization or data integrity.

## Current quality risks

- The application has accumulated historical/compatibility scripts and a large CSS history; future UI work should converge on a single token/component layer instead of adding more hotfix blocks.
- There is no configured dedicated linter in `package.json`; typecheck and syntax validation are currently the deterministic code-quality gates.
- External schedule synchronization depends on the upstream source being reachable in CI; the client now has a bundled official snapshot fallback for LD courses 1–6.

## Recommended target architecture

```text
Frontend SPA
  ├─ app shell / routing
  ├─ design system + theme
  ├─ schedule/calendar domain
  ├─ tasks/projects domain
  ├─ team/users/RBAC UI
  ├─ notifications
  ├─ search
  └─ support / FAQ / settings
          │
          ▼
API layer
  ├─ authentication/session
  ├─ authorization/RBAC
  ├─ events/calendars
  ├─ tasks/projects
  ├─ users/teams
  ├─ notifications
  ├─ integrations
  ├─ support/FAQ
  └─ audit/export/privacy
          │
          ▼
Database + object storage + queue/cache
```

The existing schedule parser pipeline remains a separate ingestion subsystem and feeds the calendar domain after normalization.
