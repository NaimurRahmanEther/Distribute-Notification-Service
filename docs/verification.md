# Verification, Acceptance, and Traceability

## 1. Evidence baseline

Local verification was performed on 30 October 2026 against the working tree present in this session, not an identified release tag or immutable commit. The environment used Docker Desktop Linux containers, Node.js 24, PostgreSQL 16, Redis 7, and the full Nginx/API/worker/outbox Compose stack.

The recorded run established:

- All 88 backend JavaScript source files passed `node --check`.
- `npm.cmd ls --depth=0` found the declared top-level dependencies installed.
- A fresh PostgreSQL database successfully applied all ten current migrations.
- Thirty HTTP checks passed in the main integration script, including polling checks, plus WebSocket/presence/event assertions and actual in-app delivery through outbox, BullMQ, and worker.
- Extended checks passed for admin access, controlled missing-email failure/dead letters, replay, ownership isolation, and push-subscription lifecycle.
- Thirty-five further standalone assertions passed for UTF-8 password limits, preferences, all 16 initial channel/activity combinations, queue identity, push endpoint restrictions, retry-header parsing, email escaping, socket event validation, and shutdown helpers. Earlier notification validation/default/bounds checks also passed.
- API, worker, and outbox logged `process.stopping` followed by `process.stopped` during a controlled stop. They restarted; API readiness returned HTTP 200.
- Temporary test file and two temporary accounts were removed. Existing source changes were preserved; verification did not modify application code.

The initial standalone password test used an emoji literal that PowerShell converted to question marks. It was corrected to construct the Unicode code point explicitly and passed. An initial dead-letter test incorrectly searched by notification ID, which is not a dead-letter field; it was corrected to join through the delivery ID and passed. These were verification-script issues, not application fixes.

This record is evidence of the exercised paths. It is not exhaustive test coverage, a security audit, a load test, or a production certification. Temporary scripts were removed according to repository instructions, so no retained executable regression report is provided.

## 2. Requirement traceability

Paths below are relative to `backend/src`. **Partial** means implemented behavior was reviewed but not every acceptance path was exercised.

| Requirement | Main implementation | Verification status / scope |
| --- | --- | --- |
| BR-01, FR-03, FR-05 | `modules/notification/notifications` | Verified create/list/get/read/read-all/delete; cross-user get/read/delete denied |
| FR-01 | `modules/auth/auth.validation.js`, `.service.js`, `.repository.js` | Registration and UTF-8 password-boundary checks passed; duplicate/concurrent registration not recorded as exercised |
| FR-02 | `modules/auth`, `middleware/auth.middleware.js` | Login, refresh, logout, and post-logout rejection passed; explicit concurrent-login/token-expiry combinations remain partial |
| FR-04 | `notifications/notification.repository.js` | Same request/content returned same ID; changed content returned 409; concurrent same-key race not exercised |
| BR-02, FR-06 | `preferences`, `notifications/notification.policy.js` | GET/PUT/default shape, missing flags rejection, all-disabled validation, and all channel-order combinations passed |
| FR-07 | `deliveries` | Owned list and denied cross-user list passed; individual delivery-get path not separately recorded |
| FR-08 | `workers/delivery-routing.service.js` | Selection function and in-app path passed; live rerouting/fallback combinations partially verified |
| FR-09 | `realtime`, `presence` | Authenticated socket, ready, activity acknowledgement, and new-notification event passed; multi-tab expiry/reconnect/revocation timing remains partial |
| FR-10 | `subscriptions`, `config/push.js` | Valid synthetic-key registration/list/delete and cross-user removal rejection passed; unsafe endpoints rejected; 20-device and all conflict races not exercised |
| BR-04, FR-11 | `schedules`, schedule dispatcher/processor | Future item hidden before time, visible after time, and scheduled in-app delivery passed |
| FR-12 | `notification-schedule.service.js`, `.repository.js`, delivery processor | Code-reviewed; real 30-minute/24-hour reminder execution and every cancellation race were not run |
| BR-03, FR-13 | `outbox`, delivery processor, queue modules | Live outbox->queue->worker path, payload checks, and permanent missing-email failure passed; transient retries/outages/reconciliation combinations remain partial |
| BR-05, FR-14 | `dead-letters`, dead-letter dispatcher | Admin inspection/replay 202 and repeat replay 409 passed; ordinary user 403 passed; partial multi-device replay not exercised |
| FR-15 | `operations` | Liveness/readiness and admin metrics passed; non-admin metrics rejection passed; full dependency fault injection not run |
| FR-16 | `shared/utils/shutdown.js`, process entry points | Helper cancellation/listener cleanup and real stop/restart passed; active-provider timeout/forced-exit variants not exercised |
| NFR-01..06 | Middleware, validation, repositories, queues, logs | Selected safeguards verified; comprehensive security/performance/reliability review remains open |
| BR-06, NFR-07 | `docs` and root README | Documentation checked against source; evidence and open gaps distinguished |

## 3. Reproducible local acceptance checklist

Use a disposable local database and unique test account emails. Keep HTTP volume below configured per-IP limits or wait for the advertised reset. Do not test by bypassing ownership or weakening provider endpoint checks.

### Environment and health

1. Follow the [development guide](development-guide.md) to start Compose and apply migrations.
2. Confirm postgres/redis/backend healthy; worker/outbox running; migrate exited 0.
3. Request `/health`, `/health/live`, and `/health/ready`; verify their documented envelopes.
4. Inspect logs for startup failures; confirm a running worker can process a notification, rather than relying on API readiness alone.

### Authentication and boundaries

1. Register user A and user B with unique emails and valid passwords.
2. Check malformed email, short password, and password over 72 UTF-8 bytes return 400.
3. Login A; save access token and refresh cookie in the test client's cookie jar.
4. Refresh with valid cookie; verify missing/invalid cookie is rejected.
5. Check protected access without a token returns 401; non-admin operations/dead-letter requests return 403.
6. Login A again and explicitly test old-session rejection if verifying session supersession.
7. Logout using the current cookie; verify its access token can no longer access protected data.

### Inbox, preferences, and ownership

1. Set A's permissions to `{ "IN_APP": true, "EMAIL": false, "PUSH": false }`.
2. Create a notification with UUID `requestId`; repeat identical input and compare IDs; change content with same key and expect 409.
3. Check page/limit/unread/type filtering and malformed/unknown query rejection.
4. Read one item; confirm `read_at`; read-all; confirm updated count.
5. Use B's token against A's notification/delivery routes and expect 404.
6. Disable every permission; confirm inbox persistence and absence of an initial delivery.
7. Delete owned items; confirm cascade effects through scoped database inspection if needed.

### Real-time and delivery

1. Connect A's socket using WebSocket transport and `auth.token`.
2. Install ready/new/read/delete listeners before triggering work; begin activity heartbeat using server guidance.
3. Create an immediate in-app notification; poll deliveries until SENT and assert matching event ID.
4. Verify read/delete events and read-all refresh behavior.
5. Disconnect/reconnect and refetch REST; verify client deduplication.
6. For multi-tab validation, disconnect one tab while another remains active; verify remaining presence.

### Scheduling and reminders

1. Create an item several seconds in the future with only IN_APP enabled.
2. Before due time, expect ordinary get/list exclusion; after due time, confirm visibility and poll actual delivery separately.
3. Delete a future item and verify no surviving delivery is created.
4. In an isolated environment, temporarily shorten reminder delays in environment configuration and restart affected processes.
5. Exercise eligible and ineligible types, active/inactive state, enabled/disabled channels, read cancellation, and earlier-stage ordering.
6. Restore normal settings afterward. Accelerated timings validate logic but do not replace a long-duration soak check.

### External providers and failures

1. Real email: configure an accepted sender/key, enable email, create work, inspect provider acceptance and actual recipient mailbox separately.
2. Real push: use a real browser subscription, enable push, and verify the OS notification/service worker click behavior.
3. In a controlled test setup, simulate retryable 429/5xx/network/timeout responses without sending repeated real messages; assert attempt counts, next-attempt timing, and exhaustion.
4. Verify a permanent failure produces a database dead letter and eventual DLQ publication.
5. As a dedicated local admin, inspect/replay; verify 202, repeat replay 409, read-state/channel guards, and partial push-target preservation.
6. Restore configuration and remove synthetic subscriptions. A synthetic subscription validates registration only; it is not proof of push delivery.

### Shutdown and cleanup

1. Use `docker compose stop backend worker outbox` and inspect logs for stopped events and container exit status.
2. Start them again and confirm readiness plus a functional background delivery.
3. For more coverage, repeat during active jobs and provider timeout to verify bounded shutdown behavior.
4. Delete only test-owned data; remove any specifically created test accounts using scoped parameterized database commands when no public deletion endpoint exists.
5. Remove temporary test files/folders. Do not remove database volumes or user changes as test cleanup.

## 4. Remaining verification work

| Gap | Evidence needed before claiming completion |
| --- | --- |
| Real email | Valid provider configuration, acceptance identifier, actual recipient-side result |
| Real browser push | Real subscription, encrypted send acceptance, OS display, click/revocation/expired-device paths |
| Long-duration reminders | Actual configured 30-minute and 24-hour timing under idle, active, read, and delayed-worker conditions |
| Transient provider retries | Controlled 408/429/5xx/network/timeout cases; Retry-After and attempt-bound checks |
| PostgreSQL/Redis disruption | Outage/recovery checks covering publication uncertainty, reconciliation, and no lost valid intent |
| Concurrency | Simultaneous create, login, subscribe, read/schedule, and replay races |
| Rate limits | Global/endpoint exhaustion, header accuracy, proxy IP handling, store-error behavior |
| Client behavior | Real browser cookie/CORS behavior, event recovery, accessibility, and service-worker permission lifecycle |
| Performance | Agreed workload, measurable throughput/latency/backlog/resource results |
| Old migration history | Explicit reconciliation plan tested against a representative existing database |
| Security | Dedicated review beyond selected validation/ownership tests |

## 5. Documentation validation

For this documentation baseline, check that all local Markdown links resolve, documented API paths match route files, configuration names match `config/env.js` or Compose settings, migration names match the DDL, and no secret values are included. Run link/reference checks in memory where practical; remove temporary validators if files were needed.

Historical application checks above do not become new test runs merely because this document is edited. Update the date/environment/results only when verification is actually repeated.
