# Notification Service Plan

Updated: October 19, 2026

## Goal

Build a notification service with in-app, email, and push delivery using PostgreSQL, Redis, BullMQ, a separately running worker, and a dedicated dead-letter queue (DLQ).

Choose delivery channels based on user activity, preferences, notification importance, and unread duration. Do not send every notification through every channel.

## Working agreement

- Work through one phase at a time and review it before starting the next.
- Keep code simple and follow the existing CommonJS route → controller → service → repository structure.
- Within a phase, discuss migration, repository, service, controller, routes, and validation in small steps unless a larger implementation is requested.
- Direct codebase edits are now authorized when requested. Do not advance to another phase automatically.
- Reuse existing authentication, rate limiting, database connections, migration runner, response helpers, error handling, and Docker infrastructure.
- Do not commit, push, or deploy unless requested.
- Add appropriate checks with each phase and report actual results, including limitations.

## Current state

- Authentication and Redis-backed rate limiting are implemented.
- Docker Compose contains backend, PostgreSQL, and Redis services.
- Phases 1-6 backend implementation is complete. Phase 6 adds Browser Web Push subscriptions, encrypted delivery, per-device outcomes and email fallback. Local integration checks passed; real email/push delivery and frontend integration still require configuration and real-device verification. See `docs/phase-5.md` and `docs/phase-6.md`.
- The user reports completing the notification migration.
- Notification, delivery, and preference files are organized under `backend/src/modules/notification/notifications/`, `backend/src/modules/notification/deliveries/`, and `backend/src/modules/notification/preferences/`. Each module contains its repository, service, controller, routes, and validation.
- Notification routes are registered at `/api/v1/notifications`.
- Listing uses a simple row query and a separate count query, without JSON aggregation. Concurrent writes can cause a small difference between the count and page results.
- Notification creation is currently a self-only demonstration endpoint. The recipient comes from the authenticated session.
- Latest verification: 27 Phase 6 checks passed with PostgreSQL, Redis/BullMQ, authenticated routes, encrypted push payloads and simulated browser examples. Earlier Phase 3-5 checks are documented in their phase docs. Temporary test artifacts are removed after testing.
- Phase 2 verification: 16 mocked transaction/API checks and 9 real PostgreSQL integration checks passed. Migration up/down/up was verified in an isolated schema, then migrations 004–006 were applied to the local development database. The temporary schema was removed and no test files were retained. Full authentication/rate-limit regression coverage remains unverified; the package's `npm test` script is still a placeholder.

## Delivery policy

Every notification is persisted in PostgreSQL. Read status is separate from delivery status.

### Initial delivery

| Situation | Planned behavior |
| --- | --- |
| User is active in the app | Deliver in-app through Socket.IO; skip immediate push and email |
| User is offline or the app is in the background | Attempt push if enabled and a valid subscription/device is available |
| Push is unavailable or fails | Consider email if enabled and permitted by the notification policy |
| Important security event | Apply an explicit policy that may require email even while the user is active |

The stored in-app inbox remains available regardless of which external channel is selected. App activity, socket connection, client receipt, and reading are different signals. A socket connection alone does not prove receipt; a provider accepting a message does not prove the user read it.

### Unread reminders

- A notification can trigger a later push or email reminder even if its initial in-app delivery succeeded.
- Example timing: push after 15 minutes unread, email after 2 hours unread. These are illustrative, not finalized defaults.
- Configure timing and eligible channels by notification type/importance. Not every notification requires reminders.
- Before each reminder, check that the notification exists, remains unread, the channel is allowed, and that reminder has not already completed.
- Reading or deleting a notification makes remaining reminders ineligible. Cancel pending jobs where practical and always recheck eligibility in the worker.
- A send already in progress may complete after the notification is read; do not promise recall.
- Persist reminder intent and use BullMQ delayed jobs rather than in-memory timers alone.

## Creation and authorization

For now, `POST /api/v1/notifications` creates a notification only for the logged-in user. It accepts `type`, `title`, `message`, and optional `data`; clients cannot supply a recipient or generated notification ID.

In the finished application, trusted backend events create notifications for authorized recipients. Examples include a message received, an order shipped, or a security event. The domain service checks the initiating user's permissions and determines the recipient. Add an internal creation service without exposing an unrestricted cross-user HTTP endpoint. If a separate application calls this service, define service authentication and recipient authorization first.

## Target architecture

```text
Authorized application event / API request
    → Notification service
    → PostgreSQL transaction
        → Notification
        → Delivery/reminder intent
        → Outbox event
    → Outbox dispatcher
    → BullMQ
    → Independent worker
        → Recheck activity, preferences, read status, and delivery state
        → In-app / email / push provider
        → Record outcome in PostgreSQL
        → Retry transient failures with bounded backoff
        → Record permanent/exhausted failures and publish to DLQ
```

PostgreSQL is the source of truth. Queue processing and outbox publishing are at-least-once. Database constraints and idempotency checks protect logical operations; provider-side idempotency is needed where available to reduce duplicate external sends after uncertain outcomes.

## Phase 1 — Notification management API

Status: implemented, pending verification and resolution of validation/test differences.

Files: existing notification migration pair and notification module files, plus route registration in `backend/src/app.js`.

Deliverables:

- Notifications table with UUID notification IDs and BIGINT user foreign keys.
- User/time index and partial unread index.
- Self-only creation, listing, fetching, marking one read, marking all read, and deletion.
- SQL ownership filters, parameterized queries, pagination, type and unread filters.
- Validation consistent with the auth module's simple style.
- Preserve the original `read_at` on repeated mark-read requests.

Completion checks:

- Verify all six endpoints with a development database and two users.
- Verify filtering, pagination, invalid inputs, missing records, and cross-user protection.
- Decide whether `data` is any JSON value or an object with a size limit; align validation and tests.
- Verify migration up/down on an isolated disposable database.
- Establish runnable tests and verify existing auth/rate-limit behavior.

## Phase 2 — Delivery tracking, preferences, and transactional outbox

Status: complete for Phase 2 scope. See `docs/phase-2.md` for behavior, internal authorization, verification, and limits. Phase 2 originally selected IN_APP first. Phase 4 now prefers IN_APP for active users and PUSH/EMAIL for inactive users, respecting enabled channels.

Deliverables:

- Migrations and repositories for `notification_deliveries`, `notification_preferences`, and outbox records.
- Support the intended channels `IN_APP`, `EMAIL`, and `PUSH`; enable actual delivery only as providers are implemented.
- Define explicit delivery states, legal transitions, channel defaults, and security-notification exceptions.
- Unique logical delivery keys that distinguish initial delivery from later reminder stages.
- Save notifications and required delivery/outbox intent in a single transaction.
- Own-user preference read/update endpoints and validation.
- Trusted internal recipient creation with explicit authorization boundaries.

Completion: a committed notification cannot lose its delivery intent if Redis is unavailable; rolled-back creation leaves no partial records.

## Phase 3 — BullMQ, outbox dispatcher, and separate worker

Status: implemented and live Redis acceptance tested on October 19, 2026. Actual queue publication, worker processing, retry, timeout, duplicate suppression and failure recovery were checked in isolated test infrastructure. Phase 4 now publishes IN_APP events to Socket.IO; email and push sending remain later-phase work.

Deliverables:

- Queue configuration, validated job payloads, and reusable producer.
- Independently runnable worker and dispatcher entry points.
- Dedicated queue connection settings without changing rate-limiter behavior.
- Multi-instance-safe outbox claiming, publication retry, and stable job IDs.
- Mark publication complete only after enqueue succeeds; tolerate duplicate publication.
- Bounded worker concurrency, explicit provider deadlines, retry classification, and exponential backoff.
- Duplicate execution checks backed by PostgreSQL.

Completion: API requests do not wait for delivery; Redis outage/recovery and duplicate publication do not silently lose delivery intent.

## Phase 4 — In-app delivery and activity tracking

Status: implemented and live-tested. See `docs/phase-4.md` for the reading order, client event contract, presence semantics and limitations. Initial selection uses client-reported recent activity; provider fallback and unread reminders remain later phases.

Deliverables:

- Socket.IO integration with existing HTTP server and access-token/session validation.
- Server-controlled `user:<userId>` rooms; clients cannot select other users' rooms.
- Session revocation/expiry handling for long-lived connections.
- Worker-to-API socket delivery bridge suitable for separate processes.
- Shared presence/activity tracking with expiry and support for multiple devices/tabs.
- Events for new notifications and read-status changes; client receipt acknowledgement where needed.
- REST retrieval of missed notifications after reconnect.

Completion: intended users receive events; offline users retain their inbox; emitting an event is not recorded as proof of reading.

## Phase 5 — Email delivery

Status: implemented and locally verified; real-provider delivery has not been tested. Setup and code reading order: `docs/phase-5.md`.

Deliverables:

- Select an email provider and add a small provider interface.
- Environment-based credentials, message templates, and provider message IDs.
- Apply preferences and initial-delivery fallback rules.
- Classify temporary versus permanent errors and use provider idempotency where supported.
- Mock email delivery in automated tests.

Completion: email is sent only when policy permits it, outcomes are tracked, and failures do not erase notifications.

## Phase 6 — Push delivery

Status: Browser Web Push implemented with frontend integration examples. Subscriptions and push targets use separate migrations 007 and 008; `push_initialized` is defined in migration 004. Both push migrations are applied locally; 27 phase checks passed. Real-browser delivery is not yet verified. Setup and reading order: `docs/phase-6.md`.

Deliverables:

- Confirm browser Web Push versus native/mobile push before selecting a provider.
- Authenticated registration/removal of device tokens or subscriptions with ownership checks.
- Permission/consent handling and support for multiple devices.
- Push provider, invalid-subscription cleanup, and per-target outcomes.
- Respect activity, user preferences, and fallback eligibility.

Completion: eligible devices receive push and invalid registrations are retired without endlessly retrying them.

## Phase 7 — Dedicated DLQ and recovery

Deliverables:

- Explicit maximum attempts and retryable/permanent failure rules.
- Dedicated DLQ for permanently failed or exhausted jobs, distinct from normal retries.
- Persist terminal failure and DLQ publication intent transactionally so a crash cannot lose the handoff.
- Idempotent DLQ publication plus reconciliation for jobs failing outside normal processor handling.
- Protected inspection and controlled replay through an operational command or authorized interface.
- Record failure reason, delivery/job IDs, timestamps, and replay history without secrets.
- Replays recheck existence, read status, preferences, and completed delivery state.

Completion: failures remain visible and recoverable, duplicate DLQ entries are controlled, and replay cannot bypass delivery policy.

## Phase 8 — Scheduling, unread reminders, and reliability

Deliverables:

- Persistent scheduled-delivery and unread-reminder state using UTC timestamps.
- BullMQ delayed jobs backed by durable intent and recovery/reconciliation.
- Finalize reminder intervals, maximum reminders, eligible types, and cancellation behavior.
- Prevent duplicate reminder stages with database uniqueness and conditional state transitions.
- Request idempotency where retries can create duplicate notifications.
- Test worker crashes, provider timeouts, concurrent workers, read/send races, queue loss, and Redis recovery.

Completion: restarts do not silently lose scheduled work; reading a notification suppresses later eligible reminders; retries do not create duplicate logical reminders.

## Phase 9 — Runtime operations and observability

Deliverables:

- Extend Compose with worker and dispatcher processes, reusing the application image where practical.
- Graceful shutdown for HTTP, sockets, workers, database pools, and Redis connections.
- Controlled migration deployment instead of each production replica migrating on startup.
- Appropriate Redis persistence and eviction settings, health checks, secrets, and internal networking.
- Structured logs with request, notification, delivery, and job IDs.
- Metrics for outbox backlog, queue delay, delivery failures, retries, DLQ backlog, and reminder outcomes.
- Separate liveness/readiness and protect operational endpoints.

Completion: processes run and stop independently, failures are diagnosable, and persisted work survives the documented recovery scenarios.

## Phase 10 — Integration, documentation, CI, and deployment

Deliverables:

- Full integration tests with isolated PostgreSQL/Redis and mock external providers.
- End-to-end checks of active-user delivery, offline fallback, unread reminders, and DLQ replay.
- OpenAPI documentation, socket event contracts, configuration examples, and README.
- CI for tests, migration validation, and image builds.
- Deployment and rollback procedures supporting long-running workers and WebSockets.
- Demonstration of all three channels, ownership protection, failure/retry handling, and recovery.

Completion: documented and reproducible three-channel operation, verified failure handling, and CI checks before deployment.

## Decisions still to finalize

- Notification metadata validation contract in Phase 1.
- Source application events and trusted caller authorization.
- Email provider and browser versus native push requirements.
- Exact activity definition and client acknowledgement timeout.
- Reminder intervals, maximum reminders, preference defaults, and security exceptions.
- Retention and replay policy for failures and DLQ records.

Resolve each decision in its relevant phase rather than implementing later phases now.
