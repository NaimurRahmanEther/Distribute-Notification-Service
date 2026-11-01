# Notification client contracts

Baseline: 30 October 2026. This is the REST and real-time integration reference for the implemented local service. See [requirements](requirements.md) for product policies, [technical specification](technical-specification.md) for persistence/queue details, and [verification](verification.md) for exercised paths and gaps.

Use `http://localhost:8000/api/v1` with the full local Compose stack. Nginx forwards the paths below to the modular backend. IDs are UUID strings except Auth user IDs, which are decimal strings. Clients do not send `userId` to select an owner; the server uses the access token.

## Authentication and browser configuration

`POST /auth/register`:

```json
{ "fullName": "Demo User", "email": "demo@example.com", "password": "ExamplePassword123!" }
```

`POST /auth/login` accepts `email` and `password`. Read `data.accessToken` from the response. The refresh token is an HttpOnly cookie; do not copy it into JavaScript storage. `POST /auth/refresh` and `POST /auth/logout` use that cookie. Example browser login:

```js
const response = await fetch("http://localhost:8000/api/v1/auth/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.message);
const accessToken = result.data.accessToken;
```

Use `credentials: "include"` for login, refresh and logout. Set `CORS_ORIGINS` to the frontend's exact origin; set `SOCKET_ORIGINS` for its WebSocket connection. The localhost defaults include ports 3000 and 5173. These settings do not override browser SameSite/Secure cookie rules. Postman does not enforce browser CORS.

For protected routes, send `Authorization: Bearer <accessToken>`. Refresh authentication after 401; do not retry a create blindly without its original `requestId`.

## Create and manage notifications

`POST /notifications` creates a notification **for the signed-in user**. This remains the demo/self-create endpoint; arbitrary recipient creation is not exposed publicly.

```json
{
  "type": "SYSTEM",
  "title": "Account update",
  "message": "Your account settings changed.",
  "data": { "page": "settings" },
  "requestId": "7a6fd9ad-b381-4f57-92e9-bbc9cb9c1b76"
}
```

Types: SYSTEM, SECURITY, ACTIVITY, ANNOUNCEMENT. Title: 1–200 characters after trimming; message: 1–5000. `data`, `requestId` and `scheduledAt` are optional. `data` is JSON metadata, not a trusted HTML fragment or redirect URL. `scheduledAt` must be a future ISO timestamp, for example a timestamp generated with `new Date(Date.now() + 60000).toISOString()`.

A successful create returns 201 with `{ "success": true, "message": "Notification created", "data": { "notification": { ... } } }`. Notification fields use database names such as `user_id`, `read_at`, `created_at`, `scheduled_at` and `request_id`. Reusing the same requestId with identical input returns the existing notification; changed input returns 409. `requestId` is scoped to the signed-in user.

| Method/path | Input / result |
| --- | --- |
| `GET /notifications` | Optional `page=1&limit=20&unreadOnly=true&type=SYSTEM`; returns `data.notifications` and top-level `meta` |
| `GET /notifications/:id` | Returns `data.notification`; another owner's or not-yet-visible scheduled item returns 404 |
| `PATCH /notifications/:id/read` | No body required; marks read and cancels pending reminders |
| `PATCH /notifications/read-all` | No body required; returns `data.updatedCount` |
| `DELETE /notifications/:id` | Deletes owned notification and dependent records; also accepts an owned future scheduled ID |
| `GET /notification-deliveries?notificationId=<uuid>` | Returns `data.deliveries` for that owned notification |
| `GET /notification-deliveries/:id` | Returns `data.delivery` for an owned delivery |

List defaults are page 1, limit 20, unreadOnly false; maximum limit is 100. Delivery rows expose channel, stage, status, attempt_count and delivery timestamps; provider/internal error details are omitted. Clients do not create delivery/outbox rows directly.

## Preferences and browser subscriptions

`GET /notification-preferences` returns `data.preferences`. `PUT /notification-preferences` replaces all three booleans:

```json
{ "IN_APP": true, "EMAIL": true, "PUSH": true }
```

Active users prefer IN_APP → PUSH → EMAIL; inactive users prefer PUSH → EMAIL → IN_APP. Missing/unavailable initial push can fall back to enabled email. Preferences are permissions, not an instruction to send all channels at once. All disabled still permits a persisted inbox item. Default unread reminders apply only to SYSTEM/SECURITY, with PUSH at 30 minutes and EMAIL at 24 hours; activity, reading, preferences and available subscriptions affect eligibility.

| Method/path | Purpose |
| --- | --- |
| `GET /push-subscriptions/public-key` | Returns `data.publicKey`; 503 when push is not configured |
| `POST /push-subscriptions` | Submit the browser's `PushSubscription.toJSON()`; returns `data.subscription.id` |
| `GET /push-subscriptions` | Returns `data.subscriptions` for the signed-in user |
| `DELETE /push-subscriptions/:id` | Removes only that user's subscription |

Do not invent browser subscription keys in Postman for real delivery. Use [push-client.js](examples/web-push/push-client.js) in your frontend and serve [push-sw.js](examples/web-push/push-sw.js) from `/push-sw.js` on the frontend origin. Call `notificationPush.enable(apiBase, token)` from an explicit button click. Store its returned subscription ID per user/device. Before logout/account switching, call `notificationPush.disable(apiBase, token, subscriptionId)` while authentication still works. The examples require browser Web Push support and permission; adapt the click target to your frontend route.

## WebSocket events

Connect Socket.IO to `http://localhost:8000`, with `transports: ["websocket"]` and `auth: { token: accessToken }`. The backend validates auth.token directly; no socket cookie or extra Authorization header is needed. Do not connect to an API route or request a user room yourself.

| Direction | Event | Payload |
| --- | --- | --- |
| Server → client | `notification:ready` | `{ "heartbeatMs": 20000 }` with interval derived from configured presence TTL |
| Client → server | `presence:update` | `{ "active": true }` or false; acknowledgement `{ "success": true }` or `{ "success": false, "message": "..." }` |
| Server → client | `notification:new` | `{ "notification": { ... } }` |
| Server → client | `notification:read` | `{ "notification": { ... } }` including read_at |
| Server → client | `notifications:read-all` | `{ "refresh": true }` |
| Server → client | `notification:deleted` | `{ "id": "notification UUID" }` |

On ready, fetch the REST inbox and start an activity heartbeat using the supplied interval. Report actual app visibility/activity; connecting alone does not mark the user active. Clear the heartbeat on disconnect/component cleanup. Upsert events by notification ID and refetch after reconnect: live pub/sub events can be missed or duplicated.

After refreshing the access token, replace `socket.auth` and reconnect. Logout/revocation disconnects existing sockets. An activity acknowledgement is not a notification read receipt; use the REST read endpoints. IN_APP SENT means persisted inbox plus live publication, not proof of human receipt. EMAIL/PUSH SENT means provider acceptance.

## Admin failures and status handling

Admin routes use the same Bearer token but require the current user role to be admin:

| Method/path | Result |
| --- | --- |
| `GET /admin/dead-letters?page=1&limit=20` | `data.deadLetters` |
| `GET /admin/dead-letters/:id` | `data.deadLetter`, including target outcomes and jobId |
| `POST /admin/dead-letters/:id/replay` with `{}` | 202 and `data.replay` containing deliveryId, replayCount and status |
| `GET /admin/operations/metrics` | Current database/queue metrics |

Replay requires the notification to remain unread, the channel enabled and the failure eligible. Concurrent/already-applied replay returns 409. Successful push targets are preserved during partial replay.

Application errors use `{ "success": false, "message": "...", ... }`. Common statuses: 400 invalid input, 401 invalid session, 403 insufficient role, 404 unavailable/other-owner record, 409 conflicting state, 429 API IP/auth rate limit, 503 dependency unavailable. A 429 response includes `Retry-After`; wait before retrying. A request timeout may have an uncertain outcome: use the original create requestId to retry. Nginx can return its own HTML error on upstream failure, so check response status/content type before assuming JSON.

## Complete endpoint inventory

Paths in this table include the `/api/v1` prefix. `User` means a valid access token and current database session. Admin routes also check the current database role. Default success is 200; deletes return a JSON success envelope rather than 204.

| Method | Path | Access | Success | Response data |
| --- | --- | --- | --- | --- |
| GET | `/health` | Public | 200 | Standard envelope, message that service is running |
| GET | `/health/live` | Public | 200 | Raw `{ "status": "alive" }` |
| GET | `/health/ready` | Public | 200 / 503 | Raw `{ "status": "ready" }` or `{ "status": "unavailable" }` |
| POST | `/api/v1/auth/register` | Public | 201 | `user` |
| POST | `/api/v1/auth/login` | Public | 200 | `user`, `accessToken`, `tokenType`; refresh cookie in header |
| POST | `/api/v1/auth/refresh` | Refresh cookie | 200 | `accessToken`, `tokenType` |
| POST | `/api/v1/auth/logout` | Refresh cookie if present | 200 | `null`; matching cookie cleared |
| POST | `/api/v1/notifications` | User | 201 | `notification`; also 201 on matching idempotent retry |
| GET | `/api/v1/notifications` | User | 200 | `notifications`; pagination in top-level `meta` |
| GET | `/api/v1/notifications/:id` | User/owner | 200 | `notification` |
| PATCH | `/api/v1/notifications/:id/read` | User/owner | 200 | `notification` |
| PATCH | `/api/v1/notifications/read-all` | User | 200 | `updatedCount` |
| DELETE | `/api/v1/notifications/:id` | User/owner | 200 | `null` |
| GET | `/api/v1/notification-deliveries?notificationId=<uuid>` | User/owner | 200 | `deliveries` |
| GET | `/api/v1/notification-deliveries/:id` | User/owner | 200 | `delivery` |
| GET | `/api/v1/notification-preferences` | User | 200 | `preferences` |
| PUT | `/api/v1/notification-preferences` | User | 200 | `preferences` |
| GET | `/api/v1/push-subscriptions/public-key` | User | 200 | `publicKey`; 503 when unconfigured |
| POST | `/api/v1/push-subscriptions` | User | 201 | `subscription` with `id`, `created_at` |
| GET | `/api/v1/push-subscriptions` | User | 200 | `subscriptions` with IDs/timestamps only |
| DELETE | `/api/v1/push-subscriptions/:id` | User/owner | 200 | `null` |
| GET | `/api/v1/admin/dead-letters` | Admin | 200 | `deadLetters` |
| GET | `/api/v1/admin/dead-letters/:id` | Admin | 200 | `deadLetter` |
| POST | `/api/v1/admin/dead-letters/:id/replay` | Admin | 202 | `replay` |
| GET | `/api/v1/admin/operations/metrics` | Admin | 200 | `collectedAt`, `database`, `queues` |

There is no separate public scheduling endpoint: use `scheduledAt` on creation. There is no public send-to-user, session-listing, role-management, or account-recovery endpoint.

## Request validation reference

| Operation | Accepted input and limits |
| --- | --- |
| Register | `fullName`: trimmed string 1..100; `email`: trimmed valid email up to 255; `password`: 8..72 characters and at most 72 UTF-8 bytes |
| Login | Same email/password constraints; email normalization is server-side |
| Create notification | Required type/title/message; trimmed title 1..200, message 1..5000; optional JSON `data`, UUID `requestId`, ISO datetime with timezone `scheduledAt` |
| List notifications | `page`: coerced integer 1..1000000, default 1; `limit`: 1..100, default 20; `unreadOnly`: literal `true`/`false`, default false; optional supported `type` |
| ID route | UUID string `id` |
| List deliveries | Required UUID `notificationId`; no pagination fields |
| Update preferences | Exactly `IN_APP`, `EMAIL`, `PUSH`, all booleans; partial update is rejected |
| Register subscription | Endpoint max 2048, allowed HTTPS push host; optional null/nonnegative numeric `expirationTime` in milliseconds, not expired; strict `keys` object with P-256 `p256dh` and base64url `auth` |
| List dead letters | `page`/`limit` same bounds/defaults as notification list; no other filters |
| Replay | JSON body `{}`; unknown fields rejected |

Notification, preference, subscription, delivery-query, dead-letter, and ID schemas reject unknown fields. Auth schemas parse their declared fields and strip unknown fields under the current Zod object behavior; clients should send only documented fields. Refresh/logout do not require JSON credentials in a body.

`data` is accepted as JSON metadata, including non-object JSON values; omission stores `{}`. It is not separately schema-constrained by business fields. Overall HTTP body-size limits still apply. `scheduledAt` is checked against current time when creating new work; matching idempotent retries return the previously created item even if its scheduled time is now in the past.

For subscription registration, an identical endpoint/key pair for the same owner returns the existing ID with 201. Other owner/key conflicts or more than 20 devices return 409. The API does not return stored subscription endpoints/private key material in list responses.

## Response examples

Examples illustrate shape; UUIDs, timestamps, and counts are sample values.

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "notifications": [
      {
        "id": "7a6fd9ad-b381-4f57-92e9-bbc9cb9c1b76",
        "user_id": "1",
        "type": "SYSTEM",
        "title": "Account update",
        "message": "Your settings changed.",
        "data": {},
        "read_at": null,
        "scheduled_at": null,
        "request_id": null,
        "created_at": "2026-10-30T12:00:00.000Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Empty lists have an empty array; notification `totalPages` is zero when total is zero. Pagination is offset-based and ordered by creation time then ID, descending. Concurrent inserts can shift pages; clients should deduplicate/refetch as appropriate.

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": { "title": ["Example field validation message"] }
}
```

Exact Zod message wording is not a stable application contract. Shape-level/unknown-key validation may have an empty field-error object. Unexpected 5xx errors hide internal details. Some middleware/parser and proxy errors do not share all route-validation semantics.

Delivery statuses are `PENDING`, `PROCESSING`, `RETRYING`, `SENT`, `FAILED`, `SKIPPED`, and `CANCELLED`. The public delivery projection includes `id`, `notification_id`, `channel`, `stage`, `status`, `attempt_count`, `next_attempt_at`, `sent_at`, `created_at`, and `updated_at`. A `SENT` push delivery can have failed individual targets; administrators can inspect failure detail.

Dead-letter list rows include failure ID, delivery ID, replay count, reason, attempts, failure/publication/replay timestamps, and joined channel/stage/delivery status. They do not directly include a notification ID; use the delivery association when correlating records. Dead-letter listing returns a page-sized array without a total-count `meta` object. Details add `jobId` and push `targets`.

Admin metrics include seven queue entries: `notification-delivery-in-app`, `notification-delivery-email`, `notification-delivery-push`, `notification-dead-letter-in-app`, `notification-dead-letter-email`, `notification-dead-letter-push`, and `notification-schedule`. Each entry contains job-state counts and `oldestWaitingSeconds`. These are snapshots, not lifetime totals. Delivery limits are applied per channel queue; a push job can represent multiple devices.

## Rate limits, request IDs, and client recovery

All `/api/v1` routes share the configured IP budget (default 100 requests/60 seconds), including authentication requests. Additional IP budgets are register 5/15 minutes, login 10/15 minutes, and refresh/logout 30/minute. Normal CORS preflight is handled before the limiter; health routes are outside its mount.

Rate-limited responses use 429 with `Retry-After` and standard rate-limit headers. Multiple limiters can apply to auth requests; headers describe the limiter that produced/set them, not separate independent user quotas. A limiter store failure normally returns 503. Wait before retrying rather than immediately reissuing requests.

`X-Request-Id` is returned for application requests. Nginx supplies an ID; direct API calls get an accepted well-shaped forwarded ID or a generated UUID. Current browser CORS exposure lists Retry-After/RateLimit headers, not `X-Request-Id`; browser JavaScript cannot necessarily read that header across origins without a configuration/code change. It is not the same as the notification creation `requestId`.

Refresh changes the access token for the existing session and does not rotate the refresh cookie. A fresh login revokes earlier sessions for that user. On token refresh, replace socket auth and reconnect. On logout, remove browser subscriptions first if the user intends to stop that device's push messages.

After an uncertain notification-create outcome, retry with the same original request ID/content. Do not assume an HTTP timeout means no notification was created. A create 201 confirms persistence, not completed delivery. After a missed socket connection, refetch the inbox; events have no durable sequence/replay cursor.
