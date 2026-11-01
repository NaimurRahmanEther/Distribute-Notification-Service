# Development and Maintenance Guide

This guide covers local development. Read [requirements](requirements.md) for expected behavior and [technical configuration](technical-specification.md#6-configuration-reference) for all settings. Commands assume the repository root unless stated otherwise.

## 1. Prerequisites

- Docker Desktop using Linux containers and Docker Compose v2 for the full local stack.
- Node.js 24 and npm for direct Node development and client-side checks.
- A free public port, normally 8000; optionally host ports 3000, 5632, and 16382 for direct development.
- A client such as Postman, a browser frontend, or a small temporary Node script.
- Optional Resend sender/key and browser push VAPID configuration for real external delivery.

There is no complete frontend included. The browser push files under `docs/examples/web-push` are integration examples.

## 2. Full local stack

### Configure

In PowerShell, copy the example only when your local file is absent:

```powershell
if (!(Test-Path .env)) {
  Copy-Item .env.example .env
}
```

Edit `.env` locally. Choose `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`, plus separate access/refresh JWT secrets of at least 32 characters. The Compose database URL is constructed from those credentials; use URL-safe values or correctly encode credentials where a connection URL is supplied. Keep `NODE_ENV=development` and `REFRESH_COOKIE_SECURE=false` for this HTTP setup. Root `PORT=8000` controls Nginx, not the container API's port.

Do not commit local `.env` files. The checked-in example secrets are placeholders. Changing database variables does not rewrite credentials in an already-initialized PostgreSQL volume.

`DB_POOL_MAX` defaults to 20 connections per process. With default concurrency 3 for IN_APP, EMAIL, PUSH, and scheduling, consumers need 12 connections plus 2 for background work/headroom. Keep the sum of those concurrency values plus 2 within the pool; invalid combinations fail startup. Concurrency is per process, while channel rate limits are shared across worker replicas. Increasing the pool also increases the stack's possible database connections, so check [database capacity](technical-specification.md#database-capacity-and-concurrency) before increasing it or running replicas.

### Start and inspect

```powershell
docker desktop start
docker compose up -d --build
docker compose ps
docker compose logs --tail 50 migrate backend worker outbox
```

If `docker desktop start` is unavailable in your Docker version, start Docker Desktop through Windows and wait until its engine is ready.

Startup order is PostgreSQL health -> migration completion -> API readiness -> Nginx/worker/outbox. Redis must be healthy before API startup. The migration container finishing with exit 0 is expected; it is not a long-running service.

Open `http://localhost:8000/health/live` and `/health/ready`. Expected responses are `{"status":"alive"}` and `{"status":"ready"}`. Use `http://localhost:8000/api/v1` as the client API base and `http://localhost:8000` for Socket.IO.

### Iterate

The current Docker image copies source; it does not bind-mount source or run nodemon. After backend source changes:

```powershell
docker compose up -d --build backend worker outbox
```

After root environment changes, recreate affected processes using `docker compose up -d backend worker outbox`. A plain restart does not update a container's environment. API, worker, and outbox should share provider/policy settings.

### Stop while keeping data

```powershell
docker compose stop
# Or remove containers/network while preserving named volumes:
docker compose down
```

PostgreSQL and Redis use `monolith_postgres_data` and `monolith_redis_data` volumes scoped by the Compose project name. Commands that remove volumes delete local data and are not part of routine startup or this verification procedure.

## 3. Direct Node development

Start only the local datastores with the override, then configure the backend:

```powershell
docker compose -f compose.yml -f infra/compose.local.yml up -d postgres redis
if (!(Test-Path backend/.env)) {
  Copy-Item backend/.env.example backend/.env
}
cd backend
npm.cmd ci
npm.cmd run migrate:up
npm.cmd run dev
```

Before migration/startup, edit `backend/.env` to match the root database credentials. The example URL uses PostgreSQL `localhost:5632`, Redis `localhost:16382`, and API port 3000. Compose still reads/interpolates root settings, including required JWT variables, even when starting only selected services.

Open two additional terminals in `backend`:

```powershell
npm.cmd run worker
```

```powershell
npm.cmd run outbox
```

Only the API `dev` script uses nodemon. Restart worker/outbox manually after relevant source changes. Root scripts `dev`, `start`, `worker`, `outbox`, `migrate:up`, and `migrate:down` delegate to this backend package. `push:keys` is available from the backend package.

On systems without PowerShell script restrictions, `npm` is equivalent to `npm.cmd`. On Windows, `npm.cmd` avoids the common blocked `npm.ps1` execution-policy error without changing machine policy.

Avoid running the container API/workers and direct Node API/workers against the same database/Redis during normal debugging: shared consumers, sessions, and rate counters can make results confusing. Stop the container application processes first. If Nginx remains running it can show an upstream error; use the direct URL `http://localhost:3000` for this mode.

## 4. Database migrations

The runner creates `schema_migrations`, takes an advisory lock, sorts `*.up.sql` files by name, and skips names already recorded. Each file and history insert commit in one transaction. Down migration rolls back only the highest recorded migration name.

```powershell
# Direct Node; run in backend:
npm.cmd run migrate:up

# Full Compose environment:
docker compose run --rm migrate
```

The 001-010 consolidated migrations were verified against a fresh database. Existing databases with older names such as `010_create_notification_dead_letters` or `012_create_notification_schedules` need a deliberate history/schema reconciliation. Renaming a source file does not rename recorded history or migrate table contents. Do not run the current set against an old database assuming it is an incremental upgrade.

`npm.cmd run migrate:down` executes the latest down SQL and can drop its table/data. Use it only in a disposable development database after reviewing the corresponding file. There is no application-level rollback/backup workflow that makes destructive down migrations lossless.

For future changes to a shared existing database, add a new forward migration rather than silently editing a previously applied create migration. This recommendation does not perform a migration or change the present consolidated layout.

## 5. Local administrator setup

Register a dedicated local account using the API. There is no default admin, seeded password, or public role-grant endpoint. Connect to the local database using the user/database configured in root `.env`. For the example names:

```powershell
docker compose exec postgres psql -U notification -d notification
```

Within `psql`, deliberately promote only your intended development account:

```sql
UPDATE users
SET user_role = 'admin', updated_at = NOW()
WHERE email = 'your-local-admin@example.com'
RETURNING id, email, user_role;
```

Replace the example email first. The service checks the current database role on protected access. Keep local administrator use explicit; this is not a user-facing role-management feature.

## 6. Real email and push setup

For email, configure `RESEND_API_KEY` and `EMAIL_FROM` with a sender accepted by your provider. Enable the user's `EMAIL` permission. To select email predictably during testing, disable other channels for that test user. A disabled/missing provider is not a successful external-send simulation; it can produce a failed delivery/dead letter.

Generate VAPID keys locally from `backend`:

```powershell
npm.cmd run push:keys
```

Copy keys into the appropriate untracked environment file, set `VAPID_SUBJECT` to a valid contact such as your own `mailto:` address, and recreate/restart affected processes. Keep private keys out of screenshots/logs/documentation.

Serve [push-sw.js](examples/web-push/push-sw.js) from the frontend origin's `/push-sw.js`; load [push-client.js](examples/web-push/push-client.js) in the frontend. Call enable only from an explicit user action. Use a browser secure context (HTTPS or a browser-supported localhost context), grant permission, and register the real subscription. Align API CORS and socket origins with the frontend origin.

Subscribe, save the returned subscription ID for that user/device, enable `PUSH`, and report inactive status when appropriate. The service-worker click path is an example that must be adapted to the frontend. Before logout/account switching, delete the server subscription while authenticated and unsubscribe the browser. Subscription key validation alone does not establish a working push provider or OS notification.

## 7. Troubleshooting

| Symptom | Checks and recovery |
| --- | --- |
| Docker named-pipe/daemon error | Start Docker Desktop, select Linux containers, run `docker info`, then retry Compose |
| API refuses connections | Check `docker compose ps`, public `PORT`, migration exit status, and API logs |
| Nginx 502/HTML instead of JSON | Check backend health/startup; proxy errors do not use application envelopes |
| Readiness 503 | Check PostgreSQL, Redis, required migration history, draining state; readiness does not identify every dependency failure in its response |
| Database authentication fails after changing `.env` | Existing initialized volume retains original credentials; match configuration or plan an explicit local database repair |
| Migration relation already exists / missing down file | Compare `schema_migrations` with the consolidated file names; resolve old history deliberately |
| Login succeeds but refresh fails in browser | Inspect cookie host/path/Secure/SameSite and `credentials: "include"`; confirm API/frontend origins |
| Unexpected 401 after another login | One active session per user; the later login revokes the earlier session |
| 429 during manual testing | API-wide and endpoint limits overlap; honor `Retry-After`; do not misdiagnose as validation failure |
| Protected API returns 503 during Redis outage | Global limiter normally fails closed; restore Redis |
| Inbox exists but no live notification | Confirm `IN_APP`, active socket/session, event listener setup, Redis Pub/Sub, worker and outbox; refetch REST inbox |
| Notification stays pending | Check worker/outbox processes, queue connectivity, current preferences, due time, and admin metrics |
| Startup reports `DB_POOL_MAX must be at least ...` | Lower combined delivery/schedule concurrency or raise the pool within PostgreSQL's total connection budget; recreate affected processes |
| Database reports too many clients / pool connection timeouts | Count every process/replica, inspect held provider work and database health, and align pool/concurrency values; do not blindly increase all pool caps |
| Scheduled item cannot be fetched | It is hidden before `scheduled_at`; create response still provides its ID |
| Scheduled item visible but not delivered | Visibility follows time; inspect schedule/delivery processing separately |
| Push public-key route returns 503 | All VAPID settings must be present; then validate actual key compatibility with a real browser |
| Push registration 409 | Existing endpoint belongs to a user/key pair; explicitly unsubscribe before changing it; check 20-device limit |
| Email fails immediately | Confirm key and sender; missing configuration is permanent for that attempt round |
| Replay 409 | Check read state, enabled channel, current round, replay history, active lock, and remaining eligible push targets |
| Reminder never appears | Check type, configured delay, permission, active presence, read state, previous stages, provider/subscription availability |

Logs contain event names such as `process.start_failed`, `migration.failed`, `outbox.cycle_failed`, `delivery.job_failed`, `schedule.job_failed`, and `realtime.event_failed`. Capture time, request ID if applicable, notification/delivery ID, HTTP status, and relevant process state when diagnosing. Do not add provider secrets or subscription endpoints to logs.

## 8. Verification and contribution workflow

Use the [verification checklist](verification.md) after behavior changes. Repository instructions require temporary test files/folders to be removed afterward. There is no retained `npm test` suite.

Follow `AGENTS.md`: route -> validation -> controller -> service -> repository; authenticate before protected validation; consume validated input; wrap async controllers; keep SQL parameterized in repositories; pass the same transaction client; use named service/repository/middleware functions. Preserve existing contracts and retry/policy behavior unless a task explicitly changes them.

For documentation changes, check relative links, route/config names, source references, and consistency with verification evidence. For code changes, run checks appropriate to the behavior, clean temporary accounts/artifacts, and update requirement/contract/design/verification documents together.
