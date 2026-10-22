# Notification platform

CommonJS microservices for authentication and in-app, email and Web Push notifications. PostgreSQL stores durable notification intent; BullMQ workers process deliveries through provider strategies. Outbox recovery, retries, DLQ replay, scheduling and unread reminders remain in the notification domain.

```text
services/
  auth-service/             # Users, JWT sessions, auth rate limits; own PostgreSQL/Redis
  notification-service/     # Notification API, WebSockets, worker, dispatcher; own PostgreSQL/Redis
gateway/api-gateway/        # Nginx routing + internal Redis rate limits and token validation
infra/
  nginx/                    # Public Nginx load balancer
  compose.local.yml         # Optional localhost datastore ports
tools/migrate-legacy.cjs    # Offline copy into empty service databases
docs/                       # Architecture and phase guides
compose.yml                 # Local multi-service runtime
plan.md
```

## Run locally

Requires Docker Desktop with Linux containers and Docker Compose v2. From this directory, copy `.env.example` to `.env` **only if `.env` does not already exist**, then set separate database passwords, JWT secrets and an internal service token and a separate GATEWAY_IDENTITY_SECRET of at least 32 characters each. Use URL-safe database passwords because Compose builds PostgreSQL URLs from them. Local HTTP needs `REFRESH_COOKIE_SECURE=false`.

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f auth-service notification-service notification-worker outbox-dispatcher
```

Public URL: `http://localhost:8000` (root `PORT`). Two API gateway replicas start by default. Migrations run in separate one-shot containers before their APIs start. Only the load balancer publishes a port; service databases, Redis and internal APIs stay inside Docker networks.

```powershell
docker compose up -d --scale auth-service=2 --scale notification-service=2 --scale notification-worker=2
docker compose down
```

`down` preserves data. Do not add `--volumes` unless you intend to delete this stack's data. Existing legacy database volumes are not imported or deleted automatically. Read the [migration procedure](docs/microservices.md#existing-data) before switching an existing project.

## API and configuration

Existing client paths remain `/api/v1/auth`, `/api/v1/notifications`, `/api/v1/notification-deliveries`, `/api/v1/notification-preferences`, `/api/v1/push-subscriptions`, `/api/v1/admin/dead-letters` and `/api/v1/admin/operations`. Send the access token as `Authorization: Bearer <token>`. `/socket.io/` uses WebSocket transport and `auth: { token }` plus the scoped HttpOnly cookie set by login/refresh (native clients may send a Bearer header).

- `/health/live`: gateway process liveness; `/health/ready`: notification, Auth and datastore readiness.
- Email requires `RESEND_API_KEY` and `EMAIL_FROM`; Web Push requires VAPID keys/subject and a browser subscription. Empty provider settings do not send real messages.
- Active users prefer in-app delivery, then configured fallback policy applies. Default unread reminders are PUSH at 30 minutes and EMAIL at 24 hours, at most two, only SYSTEM/SECURITY. Reading suppresses later eligible reminders.
- Compose reads root `.env` and explicitly passes each service's settings. Direct Node commands read that service's `.env`. Notification processes do not receive JWT signing secrets or Auth database credentials.
- Set `CORS_ORIGINS` and `SOCKET_ORIGINS` to your frontend origins. Browser login/refresh/logout use `credentials: "include"` for the HttpOnly refresh cookie.
- The gateway checks global and route-specific shared Redis IP budgets, then validates protected-route sessions with Auth before forwarding. The global default is: default 100 requests per 60 seconds, controlled by `GATEWAY_RATE_LIMIT_MAX` / `GATEWAY_RATE_LIMIT_WINDOW_MS`. Over limit returns 429; limiter outage returns 503. See [gateway middleware](gateway/api-gateway/README.md).

See [architecture, local development and verification](docs/microservices.md), [Auth service](services/auth-service/README.md), and [Notification service](services/notification-service/README.md). Earlier phase documents describe implementation history; replace old `backend/src` paths with `services/notification-service/src`, except authentication now lives in `services/auth-service/src`.

This change includes local runtime configuration and verification. CI/CD and deployment are outside the requested scope.

Phase 10 integration verification is complete with isolated storage and mock external providers. See the [verification record and manual demonstration](docs/phase-10.md) and [client contracts](docs/client-contracts.md). Swagger/OpenAPI, CI/CD and deployment are excluded. Real email inbox receipt and browser push display remain separate environment-specific checks. Temporary test infrastructure was removed; no automated test suite is retained.
