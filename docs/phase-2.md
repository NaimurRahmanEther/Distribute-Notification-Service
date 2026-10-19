# Phase 2: persistent delivery intent

## Implemented flow

`POST /api/v1/notifications` still creates a notification for the authenticated user only. The service now uses one PostgreSQL client and transaction to:

1. Read the recipient's channel preferences.
2. Insert the notification; its foreign key enforces recipient existence.
3. Select at most one initial channel and insert its delivery record.
4. Insert a `DELIVERY_REQUESTED` outbox event containing IDs, channel, stage, payload version, and a stable delivery idempotency key.
5. Commit all writes together, or roll them all back on failure.

No Redis connection or external provider is needed for this operation. The response remains HTTP 201 with `data.notification`. Outbox records remain unpublished until the separate Phase 3 dispatcher processes them.

## Current channel policy

Missing preferences default to `IN_APP: true`, `EMAIL: false`, `PUSH: false`. Phase 2 originally selected the first enabled channel in `IN_APP`, `PUSH`, `EMAIL` order. Phase 4 now uses this order for active users and `PUSH`, `EMAIL`, `IN_APP` for inactive users; see `phase-4.md`. It does not fan out to all enabled channels. If all channels are disabled, the inbox notification is still saved without a delivery or outbox record.

This is initial intent selection only. Presence, provider availability, receipt acknowledgements, delivery failures, and unread duration do not influence selection yet. The later worker must recheck current preferences before sending. Phase 4 adds activity-aware selection; Phases 5 and 6 add email and push delivery; Phase 8 adds unread reminders. `SECURITY` currently obeys ordinary preferences, with no mandatory email override.

The migration permits `PENDING`, `PROCESSING`, `RETRYING`, `SENT`, `FAILED`, `SKIPPED`, and `CANCELLED`. The worker will implement these transitions:

- `PENDING` or `RETRYING` → `PROCESSING` when claimed; increment the attempt count.
- `PROCESSING` → `SENT` when the channel accepts delivery.
- `PROCESSING` → `RETRYING` for a transient failure with attempts remaining.
- `PROCESSING` → `FAILED` for a permanent or exhausted failure.
- Pending/retrying work → `SKIPPED` when delivery policy no longer permits sending, or `CANCELLED` when explicitly cancelled.

Crash recovery and claiming leases are Phase 3 work. `SENT` is never proof of reading. No public endpoint allows a user to change delivery state.

## Endpoints

All endpoints require the existing Bearer authentication middleware.

| Method | Endpoint | Input |
| --- | --- | --- |
| GET | `/api/v1/notification-preferences` | None |
| PUT | `/api/v1/notification-preferences` | All three booleans: `IN_APP`, `EMAIL`, `PUSH` |
| GET | `/api/v1/notification-deliveries?notificationId=<uuid>` | Owned notification ID |
| GET | `/api/v1/notification-deliveries/:id` | Owned delivery UUID |

Preference updates affect only the authenticated user. Delivery reads enforce ownership in SQL and return 404 for missing/inaccessible records. Provider message IDs and internal failure descriptions are omitted from public delivery responses.

## Trusted internal creation

`notification.service.createForRecipient(userId, input, authorizeRecipient)` is an in-process backend API, not an HTTP endpoint. The trusted caller supplies an existing database user ID. The service checks that an ID was provided, validates the notification body, and requires `authorizeRecipient(userId)` to return exactly `true` before starting database work. The notification foreign key checks recipient existence in the transaction; malformed IDs are left to PostgreSQL's type validation.

The calling domain service supplies this callback using verified actor/event permissions. Never derive it from a request-body role or an unverified claim, and do not expose a generic endpoint that always supplies `true`. This callback makes the authorization boundary explicit; it is not a sandbox against trusted server code. No admin role or external service credential is invented by this implementation.

This method owns its transaction. It cannot yet atomically commit a message/order write performed in another transaction or database. A domain application's outbox can integrate those events later. Request-level idempotency remains Phase 8 work.

## Files

- `backend/src/modules/notification/notifications/notification.service.js`: transaction orchestration and internal authorization.
- `backend/src/modules/notification/notifications/notification.policy.js`: initial channel selection.
- `backend/src/modules/notification/deliveries/`: internal creation and owned delivery reads.
- `backend/src/modules/notification/preferences/`: preference defaults and updates.
- `backend/src/modules/notification/outbox/`: internal event construction and repository.
- Migrations `004`–`006`: deliveries, preferences, and outbox.

Outbox has no user-facing controller or routes because publication is an internal dispatcher responsibility.

## Verification on October 15, 2026

- 16 mocked transaction/API checks passed, including rollback after each write failure, connection release, authorization, channel selection, and no database queries escaping the transaction client.
- 9 real PostgreSQL integration checks passed in a separately generated temporary schema: migration up/down/up, atomic creation, SQL ownership, uniqueness/check constraints, preference isolation, all-disabled behavior, an injected outbox failure, trusted creation, and read/delete behavior.
- The temporary schema was removed, and no test files were retained as requested.
- Migrations `004`, `005`, and `006` were applied successfully to the existing local development database using the project's migration runner. Existing `001`–`003` were already applied.
- JavaScript syntax checks passed. External delivery and queue publication were not tested because those belong to later phases.

The earlier empty `004` had not been recorded as applied in this local database. Other environments that previously recorded it as applied need a reviewed repair migration; do not delete migration history blindly.
