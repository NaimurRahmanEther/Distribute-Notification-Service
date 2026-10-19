# Phase 4: live in-app notifications and activity

## What is implemented

The API now serves Socket.IO over the same HTTP server. The worker publishes an internal Redis Pub/Sub event; each API instance receives it and sends it only to its own authenticated sockets in the intended user's room. Two API instances and a separate worker process are supported without sharing process memory.

PostgreSQL remains the inbox source of truth. Redis Pub/Sub and socket events are live hints, not durable delivery receipts. A disconnected client recovers by fetching the existing REST inbox. No migration is needed: presence is temporary Redis data and notifications/read status already exist in PostgreSQL.

## Read the files in this order

1. `backend/src/config/env.js`: origins, session-check interval, presence expiry and Redis namespace.
2. `backend/src/config/realtime.js`: dedicated Redis connections for presence and the event bridge.
3. `backend/src/realtime/notification-socket.validation.js`: handshake, activity and internal event payloads.
4. `backend/src/modules/notification/presence/notification-presence.repository.js`: per-socket online/active expiry scores in Redis.
5. `backend/src/modules/notification/presence/notification-presence.service.js`: presence reads and conservative behavior when Redis is unavailable.
6. `backend/src/modules/notification/notifications/notification.policy.js`: initial channel selection using current activity.
7. `backend/src/realtime/notification-events.js`: worker/API publication to Redis.
8. `backend/src/realtime/notification-socket.js`: authentication, rooms, activity, event subscription, session checks and shutdown.
9. `backend/src/providers/notification-provider.js`: the worker's IN_APP provider publishes `notification:new`.
10. `backend/src/modules/notification/notifications/notification.service.js`: presence-aware creation and read/delete sync after database writes.
11. `backend/src/server.js`: connect Express, HTTP and Socket.IO; clean shutdown.
12. `backend/src/workers/notification-worker.js`: close the new Redis connection during worker shutdown.

## Running

Configure reachable PostgreSQL and Redis, install dependencies, then run from `backend` in three terminals:

```powershell
npm.cmd install
npm.cmd run migrate:up
npm.cmd start
npm.cmd run outbox
npm.cmd run worker
```

The last three commands are separate long-running processes. Compose still runs the API, PostgreSQL and Redis; dedicated Compose worker services remain Phase 9.

New settings are present in root/backend `.env` and `.env.example` files:

| Setting | Default | Meaning |
| --- | --- | --- |
| `SOCKET_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated permitted browser origins |
| `SOCKET_CHECK_MS` | `15000` | Session recheck interval; capped internally to one-third of presence TTL |
| `PRESENCE_TTL_MS` | `60000` | Online lease and client activity lifetime |
| `REALTIME_PREFIX` | `notification-service:realtime` | Shared Redis namespace across API and worker processes |

Use the same Redis host/port and realtime prefix in all processes. WebSocket-only transport is intentional; configure reverse proxies to allow WebSocket upgrades. Native clients without an Origin header are allowed but still require a valid access token. No wildcard browser origin is enabled by default.

## Client contract

Connect using the access token from the existing login endpoint, not the refresh-token cookie:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:8000", {
  transports: ["websocket"],
  auth: { token: accessToken },
});

let heartbeat;

function reportActivity() {
  if (socket.connected) {
    socket.emit("presence:update", {
      active: document.visibilityState === "visible",
    });
  }
}

socket.on("notification:ready", ({ heartbeatMs }) => {
  clearInterval(heartbeat);
  reportActivity();
  heartbeat = setInterval(reportActivity, heartbeatMs);
  // Fetch GET /api/v1/notifications here on every connection/reconnection.
});

document.addEventListener("visibilitychange", reportActivity);
socket.on("disconnect", () => clearInterval(heartbeat));

socket.on("notification:new", ({ notification }) => {
  // Upsert by notification.id rather than appending duplicates.
  console.log(notification);
});
socket.on("notification:read", ({ notification }) => {
  // Update the inbox item using notification.id and notification.read_at.
});
socket.on("notifications:read-all", () => {
  // Refetch the inbox: the event is an invalidation hint.
});
socket.on("notification:deleted", ({ id }) => {
  // Remove the inbox item with this ID.
});
```

Remove the visibility listener and heartbeat when the frontend component is destroyed. After obtaining a refreshed access token, set `socket.auth = { token: newAccessToken }` and reconnect. A server-disconnected socket does not automatically reconnect; reconnect only after restoring authentication. Register `connect_error` handling to show authentication/connection failures.

`presence:update` optionally accepts an acknowledgement callback. The response is `{ success: true }` or `{ success: false, message }`. This acknowledges activity recording only. A socket emission is not proof that a person saw or read a notification. Continue using the existing authenticated REST read endpoints; no separate receipt state or client read permission is inferred from socket connectivity.

## Presence and channel selection

- Each socket has its own member in the user's online and active sorted sets. Disconnecting one tab does not remove another tab.
- Online means a valid connected socket whose server lease has not expired.
- Active means a valid client reported `active: true` recently. Connection alone is not activity. Activity expires without client reports, even while the socket remains online.
- The example treats a visible app as active; this is a client-reported hint, not proof of attention.
- Active user: first enabled channel in `IN_APP`, `PUSH`, `EMAIL` order.
- Inactive/offline user: first enabled channel in `PUSH`, `EMAIL`, `IN_APP` order.
- Unknown presence (Redis failure): retain the conservative in-app-first order, avoiding extra external notifications based on uncertain activity.
- All disabled: persist the inbox notification without creating delivery intent.

Selection is a snapshot at creation. Workers still recheck preferences and reminder read status. Provider availability, send-time channel switching, fallback after an external send failure, and unread reminders remain Phases 5/6/8. EMAIL and PUSH still fail with `PROVIDER_NOT_IMPLEMENTED`; keep them disabled when demonstrating real in-app delivery in this phase.

## Authentication and delivery semantics

Only the server chooses `user:<userId>` rooms from the authenticated identity. There is no client `join` handler. Tokens are checked at handshake, on activity events, periodically, and immediately before private socket events. Expired/revoked sessions disconnect at the next check; pending live events reauthenticate rather than waiting for that timer. A logout or replacement login is reflected through the existing database session rules.

The bridge re-reads notification ownership/content before emitting and rechecks IN_APP preferences for new notifications. Each API instance only emits locally; Redis delivers the internal message to every API subscriber. No Socket.IO Redis adapter is needed for this particular fanout design.

`IN_APP` SENT means inbox persistence and successful Redis publication. There may be zero connected recipients. Pub/Sub subscriber outages can lose live hints, and retries can produce duplicates; clients upsert by ID and refetch on reconnect. Read/delete hints are best effort after the database write: a lost hint must not turn a committed REST operation into an error. Durable live-event replay and unread escalation are later reliability work.

## Verification on October 19, 2026

29 live checks passed using a temporary PostgreSQL schema, actual Redis, two HTTP/Socket.IO API instances, real Socket.IO clients and the separate notification worker process. Checks covered authentication/origin rejection, real Redis-backed HTTP login, cross-user isolation, cross-instance delivery, read/delete sync, multiple tabs, active/background/expired presence, channel selection, offline REST recovery, token expiry, logout, malformed bridge events and conservative unknown presence handling.

Temporary tests, schemas, queue data and the isolated Redis container are removed after verification. Existing application data is not used as test data.

## References

- [Socket.IO middleware](https://socket.io/docs/v4/middlewares/): handshake authentication runs once, so long-lived sockets require subsequent session checks.
- [Socket.IO rooms](https://socket.io/docs/v4/rooms/): server-controlled user rooms and automatic room departure on disconnect.
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/): application-level persistence/recovery is required for missed server events.

The actual `server.js` entry point also passed startup/HTTP-health and graceful-shutdown checks. All 54 JavaScript source files passed syntax and local import checks.
