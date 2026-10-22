# Notification client contracts

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
