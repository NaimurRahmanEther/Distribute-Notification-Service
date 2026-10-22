# Notification service

A modular monolith built with Express, PostgreSQL, Redis and BullMQ. Auth and notifications share one backend and database. Nginx is a reverse proxy; there is no separate API gateway.

```text
Browser -> Nginx -> Express backend -> PostgreSQL
                         |                |
                         |         notification + delivery + outbox
                         |                |
                       Redis <- outbox dispatcher
                         |
                    BullMQ worker -> in-app / email / Web Push
```

The API, worker and outbox are three processes from the same backend package. They are not independent microservices.

## Folder structure

```text
backend/src/
  modules/
    auth/              registration, login, sessions
    notification/      inbox, deliveries, preferences, subscriptions,
                       presence, outbox, schedules, dead letters
    operations/        health and admin metrics
  middleware/          auth, role, validation, rate limits, errors
  database/            migrations
  queue/               BullMQ producers and job schemas
  workers/             delivery, scheduling and outbox processing
  providers/           in-app, email and push strategies
  realtime/            Socket.IO events and presence
  config/              environment, PostgreSQL, Redis, queue settings
  shared/              small response/error/shutdown helpers
infra/nginx/            reverse proxy
compose.yml            local runtime
```

## Run locally

Use Docker Desktop with Linux containers. Copy root .env.example to .env only if .env does not exist. Set database credentials and separate access/refresh JWT secrets of at least 32 characters. Use URL-safe database passwords. For local HTTP keep REFRESH_COOKIE_SECURE=false.

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f backend worker outbox
```

Public URL: http://localhost:8000 (root PORT). Only Nginx publishes a port. Migrations run before the API starts. PostgreSQL and Redis persist in monolith-specific named volumes. docker compose down stops the stack without deleting its data.

Previous microservice/legacy volumes are untouched and are not automatically imported. Do not point the new backend at a notification-only database: it needs the users/session tables and foreign keys defined by the monolith migrations. Existing local environment backups are ignored under infra/legacy/; retired source is ignored under .legacy-code/.

## Direct Node development

```powershell
docker compose -f compose.yml -f infra/compose.local.yml up -d postgres redis
cd backend
npm ci
npm run migrate:up
npm run dev
# Separate terminals in backend:
npm run worker
npm run outbox
```

Copy backend/.env.example to backend/.env only if absent, then match its DATABASE_URL password to root .env. The optional datastore ports are localhost:5632 and localhost:16382. Direct API port is 3000. Normal Compose reads root .env; direct Node commands read backend/.env. The backend trusts one proxy hop; expose only Nginx for shared access.

## Behavior

Migration layout: each application table has one create migration and its matching rollback file. Columns and constraints live in that table's original CREATE TABLE. These consolidated files initialize a fresh database; editing them does not update an existing database that already recorded the migration. Migration numbers may contain gaps.

- Existing /api/v1/auth and notification/admin endpoints are preserved. See [client contracts](docs/client-contracts.md).
- Express checks Redis IP limits, then local JWT/session authentication, route validation, controller, service and repository.
- Requests normally share 100 API calls per IP per minute, configurable with RATE_LIMIT_MAX/WINDOW_MS. Auth endpoints also have their existing stricter limits. Health/preflight requests are exempt. Standard RateLimit headers and Retry-After describe the applicable limiter.
- Socket.IO uses WebSocket transport and auth: { token: accessToken }; no gateway cookie/header is required. Session revocation is rechecked after connecting.
- Active users prefer in-app delivery. Default unread reminders are PUSH at 30 minutes and EMAIL at 24 hours, only SYSTEM/SECURITY, at most two. Reading cancels pending eligible work.
- Outbox, retry/backoff, idempotency, DLQ/replay, scheduling and per-device push outcomes remain enabled.
- Email needs RESEND_API_KEY/EMAIL_FROM. Web Push needs VAPID keys/subject and a real browser subscription. Missing provider configuration does not send external messages.
- /health/live checks the API; /health/ready checks migrations/PostgreSQL/Redis. Admin metrics are under /api/v1/admin/operations/metrics.

Read [the backend guide](backend/README.md) in order. Phase 10 covers local integration verification and client documentation; CI/CD, deployment and Swagger are excluded.
