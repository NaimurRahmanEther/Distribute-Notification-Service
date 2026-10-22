# Notification service

Owns notifications, preferences, browser subscriptions, deliveries, outbox, schedules and dead-letter records. Its Redis handles BullMQ and realtime presence/pub-sub. It calls Auth over HTTP; it has no access to Auth's database or JWT signing secrets.

Read the [root setup](../../README.md) first. This service runs three independent processes using the same package and owned database:

```powershell
npm ci
npm run migrate:up
npm run dev
# Separate terminals, in this directory:
npm run worker
npm run outbox
```

Direct development uses port 3002. `AUTH_SERVICE_URL` must reach Auth; both services need the same internal service token. Copy `.env.example` only if `.env` is absent. See [local datastore setup](../../docs/microservices.md#direct-node-development).

Reading order:

1. `src/app.js` → `src/middleware/auth.middleware.js` → `src/clients/auth.client.js`.
2. `src/modules/notification/notifications/`: route → validation → controller → service → repository.
3. `src/modules/notification/recipients/`: a local ID/email projection, not another users table.
4. Preferences, deliveries, outbox and schedules under `src/modules/notification/`.
5. `src/workers/outbox.js`, `outbox-dispatcher.js`, `src/queue/`.
6. `src/workers/notification-worker.js`, `delivery.processor.js`, `delivery-routing.service.js`.
7. `src/providers/notification-provider.js` and the in-app/email/push strategies.
8. `src/realtime/`, presence/subscriptions, dead letters and operations modules.
9. `src/database/migrations/`: only notification-owned tables.

Recipient details come from Auth before delivery. A deleted recipient fails permanently; an unavailable Auth service uses normal retry handling. The in-process `createForRecipient` entry point still requires caller authorization; it is not a public cross-service creation endpoint.

Phase details: [6](../../docs/phase-6.md), [7](../../docs/phase-7.md), [8](../../docs/phase-8.md), [9](../../docs/phase-9.md). Their older startup commands are superseded by the root README.

Gateway authentication: Compose requires a signed identity verified by `src/clients/gateway-identity.js` before HTTP business routes and Socket.IO authentication. Direct Node development explicitly uses `REQUIRE_GATEWAY_IDENTITY=false` for Auth introspection. Read [the gateway guide](../../gateway/api-gateway/README.md) for the browser socket cookie contract.
