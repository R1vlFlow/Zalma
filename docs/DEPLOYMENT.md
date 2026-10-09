# Zalma production deployment

## Runtime

- Node.js 22.5+ (the application uses the built-in `node:sqlite` API).
- No frontend framework migration is required; the existing TypeScript SPA is built into `dist/`.

## Install and build

```bash
npm ci
npm run build
npm run lint
npm test
npm run qa
```

## Database migrations

The server runs SQL migrations from `db/migrations/` on startup. SQLite is the current production-compatible persistence layer.

For a new deployment, create the storage directory and start the server:

```bash
mkdir -p storage/attachments storage/snapshots
npm start
```

Migration `001_app.sql` creates the migration ledger, personal event store, support ticket/message tables, attachment metadata and indexes. Migrations are idempotent and tracked in `schema_migrations`.

## Environment

Copy `.env.example` to the deployment environment and set `APP_DB_PATH`, `APP_ATTACHMENTS_DIR`, `PORT`, and `HOST` as required. `REDIS_URL` is optional.

## Schedule data

The official LD schedule can be served live from `LIVE_LD_JSON` or from `data/official-schedules.json`. The pipeline materializes `weekly-block` records into calendar dates using `weekStart + matrixSlots` and splits 185/205-minute double practicals into `1/2` and `2/2`.

Snapshots are versioned with `PIPELINE_VERSION` so stale pre-normalization snapshots are ignored after deployment.

## Security note

The current repository still does not contain a real user identity provider. API ownership is keyed by `x-user-id` supplied by the SPA. This is suitable for the current local-first/student deployment but is **not** a substitute for authenticated sessions, OAuth/OIDC, server-side RBAC, CSRF protection and account recovery. Those should be added before exposing shared/team administration to untrusted users.
