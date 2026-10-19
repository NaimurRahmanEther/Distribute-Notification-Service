# Phase 6: Browser Web Push

Implemented October 19, 2026 for a web application. Uses the `web-push` library for encryption/VAPID and built-in `fetch` for abortable HTTP requests. No Firebase SDK or native mobile app is required.

## Setup

Migrations are split by table: `007_create_push_subscriptions` creates subscriptions and `008_create_push_targets` creates per-device outcomes. The `push_initialized` column is defined directly in migration `004_create_notification_deliveries`. Fresh installs receive all three through `npm run migrate:up` from `backend`.

The current development database previously ran the combined 007, so its column and target table already exist. Migration 008 preserves that table using `IF NOT EXISTS` and records the new migration as applied. An older database that ran 004 but never ran the original combined 007 needs `ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS push_initialized BOOLEAN NOT NULL DEFAULT FALSE;` once before starting the worker: editing an already-applied migration does not rerun it. Do not reset an existing database just to pick up this file reorganization.

Generate a VAPID key pair **once** from `backend`:

```sh
npm run push:keys
```

Put its values in `backend/.env` for local Node processes, or root `.env` for Docker Compose:

```dotenv
VAPID_PUBLIC_KEY=generated_public_key
VAPID_PRIVATE_KEY=generated_private_key
VAPID_SUBJECT=mailto:your-real-contact@example.com
```

Keep the private key on the server. API and worker must use the same key pair. Changing it requires browsers to unsubscribe and subscribe again. Restart the API and worker after configuration changes. Run `npm start`, `npm run outbox` and `npm run worker` in separate terminals, as in Phase 3. Compose still starts only the API.

Copy [push-sw.js](examples/web-push/push-sw.js) into your frontend's public directory so it is served at `/push-sw.js` from the web application's origin. Adapt [push-client.js](examples/web-push/push-client.js) to your frontend. If the app already has a service worker, merge these event handlers into it instead of replacing it.

The frontend example exposes:

```js
// Call from an Enable notifications button click. Supply the current access token.
const subscriptionId = await window.notificationPush.enable(apiBase, accessToken);

// Before logging out/account switching, while the access token is still valid:
await window.notificationPush.disable(apiBase, accessToken, subscriptionId);
```

Store the returned ID for the current signed-in user/device. Registration retries return the same ID. Remove the old account's subscription before switching accounts; another account cannot take ownership of it. The backend does not automatically unsubscribe browsers on auth logout. Browser subscriptions persist independently of login sessions, so skipping cleanup can leave notifications enabled for the old account on a shared device.

Enable `PUSH` through the existing preferences PUT route as a separate user choice. Subscription registration does not silently change preferences. The client helper does not automatically resubscribe after a browser expires a subscription; call enable again after permission/registration needs renewal. No actual frontend application exists in this repository yet: these are integration examples, not a deployed UI.

Production requires HTTPS, browser notification permission and a service worker. iPhone/iPad users need a supported iOS/iPadOS version and the app added to their Home Screen. Notification display still depends on browser/OS settings.

## API and Postman

All routes require `Authorization: Bearer <accessToken>`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/push-subscriptions/public-key` | Public VAPID key; 503 if configuration is missing |
| POST | `/api/v1/push-subscriptions` | Register the current user's browser subscription |
| GET | `/api/v1/push-subscriptions` | List own subscription IDs and creation times |
| DELETE | `/api/v1/push-subscriptions/:id` | Remove an owned subscription; other users receive 404 |

POST uses the **real browser's** `PushSubscription.toJSON()` output:

```json
{
  "endpoint": "https://fcm.googleapis.com/...actual-browser-endpoint...",
  "expirationTime": null,
  "keys": {
    "p256dh": "actual-browser-public-encryption-key",
    "auth": "actual-browser-auth-secret"
  }
}
```

These placeholders will not pass validation. Postman can exercise authenticated registration/deletion once you have a genuine browser subscription; it cannot create a usable subscription or display an OS notification itself. Never put `userId` in the request; authentication selects the owner.

First set `PUT /api/v1/notification-preferences`:

```json
{ "IN_APP": true, "EMAIL": true, "PUSH": true }
```

Then use `POST /api/v1/notifications`:

```json
{ "type": "SYSTEM", "title": "Order update", "message": "Your order has shipped." }
```

To exercise push, make the user inactive or temporarily disable `IN_APP`. The existing delivery read routes show the parent delivery status. Internal `notification_push_targets` rows hold per-device attempts and outcomes; there is no new public target-inspection route.

## Delivery behavior

1. Existing notification creation chooses a channel based on activity/preferences and writes delivery plus outbox atomically.
2. Before the first external send, the worker rechecks activity. Enabled in-app still takes priority for active users.
3. If push is selected but no device or VAPID configuration is available, enabled email is the initial fallback.
4. On the first push processing attempt, a transaction captures the user's current subscriptions. Retries reuse that target set; newly registered devices receive future notifications. A removed subscription cannot be sent later just because its old target exists.
5. The worker encrypts the title/message separately for each browser. Text is truncated to fit push payload limits; the full notification stays in the REST inbox. Devices are processed sequentially, least-attempted first, within the existing delivery timeout and retry budget.
6. Successful devices become `SENT` and are not deliberately retried. Transient failures retry only unfinished devices. HTTP 408, 429 and 5xx are transient; Retry-After and exponential backoff are respected.
7. HTTP 404/410 removes the invalid subscription and cancels its target. Other rejected requests become permanent target failures. Malformed VAPID configuration fails permanently instead of retrying indefinitely.
8. If no device accepted the push and all outcomes are definitively unavailable/rejected, enabled email can be created as an initial fallback. This transaction marks the source push `SKIPPED` and writes the email delivery/outbox together. Reminders do not use this initial fallback rule.
9. Network errors/timeouts that exhaust retries become `FAILED`; they do not automatically trigger email because the push might already have been accepted. If at least one device succeeded, parent delivery becomes `SENT`, with failed devices retained in the target table. Pending targets are finalized on exhaustion or failed-job reconciliation.

`SENT` means a push service accepted at least one target; it does not confirm browser display, delivery to every device, or reading. Web Push has no general provider idempotency guarantee. A process crash after provider acceptance but before saving the result can still duplicate a push. Stable push topics and service-worker notification tags reduce repeated pending/displayed notifications, but do not provide exactly-once delivery.

Subscriptions are limited to 20 per user. Requests to arbitrary subscription URLs would expose the server to SSRF, so endpoints are restricted to Google's FCM, Mozilla's push-service domain and Apple's Web Push host over HTTPS, with redirects disabled. Other push services are currently unsupported and require an explicit reviewed allowlist change.

## Reading order

1. Migrations `004_create_notification_deliveries.up.sql`, `007_create_push_subscriptions.up.sql` and `008_create_push_targets.up.sql` in `backend/src/database/migrations/`
2. `backend/src/config/env.js` and `backend/src/config/push.js`
3. `backend/src/modules/notification/subscriptions/push-subscription.routes.js`
4. `push-subscription.validation.js` in the same folder
5. `push-subscription.controller.js`
6. `push-subscription.service.js`
7. `push-subscription.repository.js`
8. `backend/src/workers/delivery-routing.service.js`
9. `backend/src/providers/push/push-target.repository.js`
10. `backend/src/providers/push/notification-push.provider.js`
11. `backend/src/providers/notification-provider.js` and `backend/src/workers/delivery.processor.js`
12. Frontend examples linked above

## Verification

27 checks passed with real PostgreSQL, Redis/BullMQ, authenticated HTTP requests and a local simulated push provider. The local provider decrypted the actual encrypted Web Push payload. Checks covered migration up/down/up, ownership, validation, concurrent registration, device limits, multi-device sends, selective retries, partial failure, expiry cleanup, missing devices/configuration, malformed VAPID configuration, activity routing, preference changes, timeout cancellation, permanent rejection, failed-job reconciliation, fallback rollback/recovery and live queue Retry-After. Frontend/service-worker examples were exercised in simulated browser contexts.

Temporary test scripts, schemas and Redis container were removed after verification. Real Google/Mozilla/Apple push delivery and notification display in a real browser were not tested. Finish VAPID/frontend setup and do a real-device smoke test before treating this phase as production-verified.

The dependency audit reported 22 advisories across the existing dependency tree (19 moderate, 3 high), with none listed against `web-push` or its newly added dependency chain. Unrelated packages were not upgraded as part of Phase 6.

References: [web-push library](https://github.com/web-push-libs/web-push), [MDN push event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event), [Apple Web Push requirements](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
