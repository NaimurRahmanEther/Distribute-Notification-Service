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

## Documentation

Start with the [documentation index](docs/README.md) for the complete development baseline.

| Topic | Document |
| --- | --- |
| Business purpose, scope, product rules, requirements, acceptance criteria | [BRD and PRD](docs/requirements.md) |
| Architecture, module boundaries, flow diagrams, design decisions | [Software design](docs/architecture.md) |
| Database, queues, providers, configuration, security boundaries | [Technical specification](docs/technical-specification.md) |
| REST, authentication, WebSockets, browser push | [API and client contracts](docs/client-contracts.md) |
| Installation, migrations, local admin setup, troubleshooting | [Development guide](docs/development-guide.md) |
| Recorded checks, requirement traceability, remaining test gaps | [Verification](docs/verification.md) |

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

Previous database volumes are untouched and are not automatically imported. Do not point the backend at a notification-only database: it needs the users/session tables and foreign keys defined by the monolith migrations.

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

Migration layout: each application table has one create migration and its matching rollback file, numbered 001–010. Columns and constraints live in that table's original CREATE TABLE. These consolidated files initialize a fresh database; editing or renaming them does not update an existing database's recorded migration history.

- Existing /api/v1/auth and notification/admin endpoints are preserved. See [client contracts](docs/client-contracts.md).
- Express checks Redis IP limits, then local JWT/session authentication, route validation, controller, service and repository.
- Requests normally share 100 API calls per IP per minute, configurable with RATE_LIMIT_MAX/WINDOW_MS. Auth endpoints also have their existing stricter limits. Health/preflight requests are exempt. Standard RateLimit headers and Retry-After describe the applicable limiter.
- Socket.IO uses WebSocket transport and auth: { token: accessToken }; no gateway cookie/header is required. Session revocation is rechecked after connecting.
- Active users prefer in-app delivery. Default unread reminders are PUSH at 30 minutes and EMAIL at 24 hours, only SYSTEM/SECURITY, at most two. Reading cancels pending eligible work.
- Outbox, retry/backoff, idempotency, DLQ/replay, scheduling and per-device push outcomes remain enabled.
- IN_APP, EMAIL, and PUSH each have a delivery queue, rate limit, and DLQ; one additional queue handles scheduling. Rate limits count jobs, not individual device requests.
- `DB_POOL_MAX` defaults to 20 per process. The sum of three delivery concurrency settings and `WORKER_CONCURRENCY` (scheduling), plus 2 background/headroom connections, must fit the pool. Defaults are 12 consumer jobs and a minimum pool of 14; invalid combinations fail startup. See [capacity budgeting](docs/technical-specification.md#database-capacity-and-concurrency).
- Email needs RESEND_API_KEY/EMAIL_FROM. Web Push needs VAPID keys/subject and a real browser subscription. Missing provider configuration does not send external messages.
- /health/live checks the API; /health/ready checks migrations/PostgreSQL/Redis. Admin metrics are under /api/v1/admin/operations/metrics.

Read [the backend guide](backend/README.md) for a source reading order. This baseline covers local development; production deployment and CI/CD are outside its scope. Implemented behavior and locally verified behavior are distinguished in the [verification record](docs/verification.md).
