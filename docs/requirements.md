# Business and Product Requirements

Baseline: 30 October 2026. Status: implementation-derived development baseline. See [document control](README.md) and [verification evidence](verification.md).

## 1. Purpose and business problem

An application needs a consistent way to store user notifications, deliver them through suitable channels, and recover from background delivery failures. Implementing each channel directly in an HTTP request would couple user-facing operations to provider latency and make retry, preference, and failure handling inconsistent.

The service provides a persistent inbox and asynchronous delivery through in-app events, email, and browser push. It centralizes ownership, preferences, activity-aware routing, scheduling, and administrative recovery within one modular backend.

## 2. Objectives and success evidence

| ID | Objective | Evidence expected |
| --- | --- | --- |
| BR-01 | Give authenticated users a private, persistent notification inbox | Owned create/list/get/read/delete operations; other users cannot access records |
| BR-02 | Respect user channel choices and current activity | Preference replacement and documented channel-selection rules |
| BR-03 | Preserve delivery intent across temporary queue/provider failures | Transactional outbox, retry states, reconciliation, and terminal failure records |
| BR-04 | Support delayed notifications and eligible unread follow-ups | Durable schedules, delayed jobs, and cancellation when read |
| BR-05 | Make failures inspectable and recoverable | Admin metrics, dead-letter details, and guarded replay |
| BR-06 | Make local development understandable and reproducible | Setup instructions, client contracts, source references, verification record |

These are qualitative objectives. No revenue target, user-volume commitment, uptime percentage, or delivery latency percentile has been agreed or measured.

## 3. Stakeholders and actors

| Actor | Responsibilities and access |
| --- | --- |
| End user | Register, authenticate, manage own inbox, preferences, and browser subscriptions |
| Frontend/client developer | Integrate REST, refresh cookies, WebSocket events, presence, and the browser service worker |
| Administrator | Inspect operational metrics and dead letters; replay eligible failures |
| Backend maintainer | Maintain policies, migrations, background processing, providers, and local setup |
| Email/push services | Accept or reject outbound delivery requests; do not determine application ownership |

There is no implemented role-management UI or public endpoint for granting administrator access. Registration creates an ordinary user. Local admin setup is a maintainer action described in the [development guide](development-guide.md).

## 4. Scope

### Included

- Local user registration, login, access tokens, refresh cookies, and revocable sessions.
- Self-owned notification creation, pagination, filtering, reads, and deletion.
- Three channel permissions: `IN_APP`, `EMAIL`, and `PUSH`.
- Explicit activity heartbeats and authenticated real-time events.
- Durable asynchronous delivery, retry/backoff, queue validation, and failure recovery.
- Future notification scheduling and up to two eligible unread reminders.
- Per-device browser push outcomes and subscription management.
- Admin failure inspection/replay and operational metrics.
- Local Compose runtime, direct Node development, migrations, and graceful shutdown.

### Excluded from the implemented product

- A complete frontend, admin dashboard, or mobile application.
- Public creation for arbitrary recipients, broadcast campaigns, bulk imports, or tenant management.
- SMS, native mobile push, marketing automation, and user-authored templates.
- Password reset, email verification, social login, MFA, account editing/deletion endpoints, or a role-management API.
- Refresh-token rotation: refresh issues another access token for the existing session.
- Guaranteed exactly-once external delivery or proof of human receipt.
- Production deployment commitments, CI/CD, automatic backups, and disaster-recovery guarantees.

## 5. Product rules

### Authentication

Users authenticate with email and password. Email is trimmed and lowercased by the service. Passwords are bcrypt-hashed with cost 12. A login atomically revokes previous unrevoked sessions and creates a new one, giving each user one unrevoked session at a time. Multiple tabs can share that session; logging in again revokes the earlier session.

Access tokens and refresh tokens use separate configured secrets. Protected requests verify token claims, an unexpired/unrevoked database session, and the user's current role. Logout revokes the matching session. Refresh validates the HttpOnly cookie and returns an access token; it does not extend the existing session's refresh expiry.

### Inbox and creation

The public create route always uses the signed-in user's ID. The client cannot choose another recipient. Supported notification types are `SYSTEM`, `SECURITY`, `ACTIVITY`, and `ANNOUNCEMENT`.

The inbox persists even when every channel is disabled. Disabling `IN_APP` prevents that delivery channel; it does not hide persisted inbox entries from REST reads.

An optional UUID `requestId` identifies creation within one user. Repeating it with equivalent validated content returns the existing notification with HTTP 201. Reusing it with changed content returns 409. Deleting the notification also removes that stored idempotency record; the key is not a permanent request history.

Future scheduled records are returned from creation but are hidden from the inbox list, normal get, and read operations until their scheduled time. An owned future notification may be deleted. Inbox visibility follows database time; it does not wait for confirmed provider delivery.

### Channel selection

Default permissions are `IN_APP=true`, `EMAIL=false`, `PUSH=false`.

| User state | Initial preference order |
| --- | --- |
| Active | `IN_APP`, then `PUSH`, then `EMAIL` |
| Inactive | `PUSH`, then `EMAIL`, then `IN_APP` |
| Presence unavailable | Treat activity as true to avoid triggering extra external delivery |

The first enabled channel is selected. Permissions do not request simultaneous delivery through every enabled channel. Before an unattempted external initial delivery, the worker may redirect to in-app if the user becomes active. Unavailable initial push may fall back to enabled email. This is a specific push-to-email fallback, not a general fallback chain for every provider error.

### Scheduling and reminders

`scheduledAt` must be a future ISO timestamp when creating new work. Explicit scheduling works independently of the unread-reminder enable flag. For a scheduled notification, reminder schedules are created when the initial schedule is processed.

| Rule | Default behavior |
| --- | --- |
| Reminder-eligible types | `SYSTEM`, `SECURITY` |
| First follow-up | Push at 30 minutes, if inactive, unread, push enabled/configured, and subscribed |
| Second follow-up | Email at 24 hours, if inactive, unread, and email enabled |
| Maximum | Two stages; configurable to one |
| Ordering | Later stages wait for earlier pending schedule/delivery work |
| Reading | Cancels pending schedules and eligible queued/retrying reminder, scheduled-initial, or replay work |
| Activity | A reminder processed while active is cancelled/skipped; it is not repeatedly postponed solely until inactivity |

Ordinary immediate initial delivery is allowed to finish after reading. Work already accepted by an external provider cannot be recalled. Reading is therefore not a guarantee that no external message can arrive afterward.

### Delivery and failure meaning

- `IN_APP SENT`: the inbox record exists and live publication succeeded; no client receipt/read acknowledgement is implied.
- `EMAIL SENT`: Resend accepted the request and returned an identifier; inbox placement is not established.
- `PUSH SENT`: at least one target was accepted; some targets can still fail.
- Terminal failure and partial push failure can create durable dead-letter records.
- Admin replay requires an eligible failure, unread notification, enabled channel, and an available delivery lock. Already-applied or conflicting replay returns 409.

## 6. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| FR-01 | Register an ordinary user | Valid input creates a safe user response; duplicate email returns 409; raw passwords/hashes are not returned |
| FR-02 | Authenticate and revoke sessions | Login returns access token and refresh cookie; refresh works for current session; logout invalidates protected access; a later login supersedes the earlier session |
| FR-03 | Create an owned notification | Valid request returns 201; notification and initial delivery intent or initial schedule commit together |
| FR-04 | Make creation retry-safe | Same user/key/content returns same ID; changed content returns 409; concurrent same-key creation is serialized |
| FR-05 | Browse and manage an inbox | Filters/pagination work; get/read/delete enforce ownership; read-all affects visible unread records only |
| FR-06 | Replace channel permissions | GET returns defaults or saved permissions; PUT requires all three booleans; all false is accepted |
| FR-07 | Report delivery outcomes privately | Owned delivery reads expose status/attempt timestamps and omit provider/internal errors |
| FR-08 | Route initial work by activity | Selection follows the policy table; disabled channels are not delivered; specific initial push fallback respects email permission |
| FR-09 | Publish live user events | Authenticated socket joins server-selected user room; explicit activity updates are acknowledged; private events recheck session validity |
| FR-10 | Manage browser subscriptions | Supported HTTPS endpoints and valid keys accepted; maximum 20 per user; endpoint/key/ownership conflicts rejected; removal is owner-only |
| FR-11 | Deliver future notifications | Future item is hidden before due time; delayed processing creates delivery intent; notification is visible after due time |
| FR-12 | Process unread reminders | Type, enabled settings, activity, channel availability, ordering, and read cancellation are enforced when work runs |
| FR-13 | Recover background failures | Transient errors retry within configured attempt limits; terminal failures are persisted; queue publication failures preserve valid intent |
| FR-14 | Inspect and replay failures | Admin can list/get/replay; ordinary user receives 403; conflicting replay is rejected; successful push targets are preserved |
| FR-15 | Report local operational state | Liveness and readiness are public; metrics require admin; dependency failures make readiness unavailable |
| FR-16 | Stop processes cleanly | API, worker, and outbox respond to SIGINT/SIGTERM, close resources, and apply a bounded shutdown deadline |

## 7. Quality requirements and limits

| ID | Requirement | Current implementation / limit |
| --- | --- | --- |
| NFR-01 | Maintain private ownership | Session validation, parameterized owner-scoped queries, and admin middleware; not a substitute for a security audit |
| NFR-02 | Maintain durable intent | PostgreSQL outbox and schedules with transaction boundaries; no exactly-once external guarantee |
| NFR-03 | Validate external boundaries | Zod request and queue schemas; provider-specific input checks; body-size limits |
| NFR-04 | Support maintainable code | CommonJS, named service/repository/middleware functions, route-to-repository layering, shared validation/async wrappers |
| NFR-05 | Make failures diagnosable | Structured event logs, request IDs, retained database outcomes, admin metrics; no distributed tracing service |
| NFR-06 | Bound local work | API/auth rate limits, worker concurrency, provider timeouts, finite delivery attempts, shutdown deadline |
| NFR-07 | Document evidence honestly | Record local checks separately from implemented but untested paths and external verification gaps |

No benchmark establishes maximum users, throughput, delivery latency, or acceptable backlog. Establish workload and measurements before making those commitments.

## 8. Dependencies and open decisions

The service requires PostgreSQL and Redis. Email requires Resend configuration and a suitable sender. Web Push requires VAPID configuration, a supported browser, a service worker, permission, and a real subscription. Clients must send explicit activity and recover missed real-time events by refetching.

Open product decisions include account recovery, admin provisioning workflow, public recipient creation, retention/cleanup policy, measurable performance targets, and whether a future client should show scheduled-but-not-yet-visible items. These are proposals for later discussion, not requirements silently added to this implementation.

Requirement-to-code and requirement-to-test mappings are maintained in [verification and traceability](verification.md).
