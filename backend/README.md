# Backend reading order

This is one application with clear modules. Read the [root setup](../README.md) before starting it.

1. src/server.js starts HTTP, Socket.IO and graceful shutdown.
2. src/app.js shows middleware order and routes.
3. src/config/env.js defines environment settings; db.js and redis.js create shared connections.
4. src/modules/auth/: routes -> validation -> controller -> service -> repository. JWT/session validation reads the current user role from PostgreSQL.
5. src/middleware/auth.middleware.js authenticates protected requests. validate.js puts parsed input in req.validated.
6. src/modules/notification/notifications/ follows the same pattern. Creation saves notification, delivery and outbox in one database transaction.
7. Preferences choose allowed channels; presence and notification.policy.js decide the initial channel.
8. src/workers/outbox.js and outbox-dispatcher.js publish saved intent to BullMQ.
9. src/workers/notification-worker.js and delivery.processor.js load the database record, enforce policy and call the provider strategy.
10. src/providers/notification-provider.js chooses IN_APP, EMAIL or PUSH. It gets recipient details through the local Auth service function.
11. src/realtime/ handles live events. Subscriptions and push targets track each browser/device independently.
12. Schedules handle delayed notifications and unread reminders; dead letters support admin inspection/replay.
13. Operations exposes health/metrics. database/migrations defines all tables in one database.

Keep SQL in repositories, decisions in services, schemas in validation files and HTTP responses in controllers. A repeated check may be necessary when a queued job runs later: ownership, current preferences, read status, attempt limits and locks protect delivery correctness. Error logs remain; routine per-request success logs are omitted.

Commands from this folder: npm run dev, npm run worker, npm run outbox, npm run migrate:up. Temporary automated tests are removed after verification; there is no retained npm test suite.
