# Phase 3: BullMQ dispatcher and worker

## Flow

```text
Notification API → PostgreSQL notification + delivery + outbox transaction
    → separate outbox dispatcher
    → BullMQ notification-delivery queue
    → separate notification worker
    → provider → delivery outcome in PostgreSQL
```

The API does not enqueue directly or wait for delivery. Phase 4 now adds a bounded Redis presence lookup and best-effort read/delete event publication. Queue and rate-limit connections remain separate. Phase 3 required no new schema migration.

## Run locally

Start PostgreSQL and Redis first. From `backend`, use separate terminals:

```powershell
npm.cmd start
npm.cmd run outbox
npm.cmd run worker
```

`npm.cmd` avoids the PowerShell script-execution restriction on this machine. On other shells `npm` works normally. Each process reads the existing backend environment configuration. Run pending migrations before starting these processes. Compose worker/dispatcher services remain Phase 9 work.

New optional settings (defaults shown):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DELIVERY_MAX_ATTEMPTS` | 5 | Maximum processing attempts |
| `DELIVERY_BACKOFF_MS` | 1000 | Base exponential retry delay |
| `WORKER_CONCURRENCY` | 3 | Concurrent jobs per process; maximum 5 for the existing DB pool |
| `DELIVERY_TIMEOUT_MS` | 10000 | Provider deadline in milliseconds |
| `OUTBOX_POLL_MS` | 1000 | Dispatcher polling and worker reconciliation interval |

## Current provider behavior

- `IN_APP`: originally confirmed persisted inbox availability. Phase 4 now also publishes a live Redis event consumed by Socket.IO API instances. `SENT` still does not mean a client received or read it. See `phase-4.md`.
- `EMAIL` and `PUSH`: not implemented yet; the worker records a permanent provider failure rather than claiming delivery. Keep these preferences disabled for the Phase 3 inbox demonstration. These providers arrive in Phases 5 and 6.
- Failed delivery rows are terminal until a controlled replay is implemented. Turning on a provider later does not automatically resend those old rows.
- A disabled channel or an already-read reminder is `SKIPPED` without incrementing delivery attempts. Initial inbox delivery is not skipped just because it is already read.
- Phase 4 adds activity-aware initial channel selection. Provider failure fallback and unread-reminder creation remain later work.

## Outbox dispatcher

`workers/outbox-dispatcher.js` opens a transaction and claims one due unpublished event using `FOR UPDATE SKIP LOCKED`. Multiple dispatchers can run without holding the same event. It validates the event and calls the producer with `jobId = deliveryId`.

Publication is bounded to five seconds. A timeout can have an uncertain outcome: Redis may have accepted the job. Republishing uses the same ID. `published_at` is only set after enqueue succeeds. A failure keeps the event unpublished, increments its publication attempt count, and schedules exponential retry capped at 60 seconds. The row lock is held during this bounded publication call.

Invalid events remain unpublished with `next_attempt_at = infinity` and `last_error = INVALID_EVENT: manual repair required`. They require inspection/repair rather than an endless validation retry. This is not the dedicated DLQ, which is Phase 7.

A crash after enqueue but before the PostgreSQL commit may publish again. Stable BullMQ IDs suppress duplicates while the job exists; PostgreSQL terminal delivery checks also protect after completed jobs have been removed. Outbox attempt counts reflect committed attempts and may undercount a crash during publication.

## Worker

`workers/delivery.processor.js` validates the job payload, loads the authoritative recipient/channel/stage from the database, and takes a PostgreSQL session advisory lock for the delivery ID. The same connection is held through processing. A competing worker delays its job without invoking the provider. PostgreSQL releases the lock if that connection closes.

The worker checks terminal status, current preferences, read status for reminders, and attempt limits. It records `PROCESSING` and increments `attempt_count` before invoking the provider. It then stores `SENT`, `RETRYING`, or `FAILED`. Ordinary provider errors retry; BullMQ `UnrecoverableError` stops retries. Provider error details are not copied into public records or logs.

A timeout aborts the supplied `AbortSignal`. Future network providers must honor that signal and use the stable delivery idempotency key where supported. A timeout or lost DB connection cannot guarantee an external send stopped; this is at-least-once processing, not exactly-once delivery.

The worker periodically reconciles published nonterminal deliveries with BullMQ failed jobs. This recovers PostgreSQL terminal status after failures outside provider handling, including exhausted database errors or stalled jobs. Failed queue jobs are retained. Completed jobs are retained up to one day/1,000 records, with database state still authoritative.

Recovery from complete Redis data loss, automatic replay, and a dedicated DLQ remain later reliability work. Never manually mark a job complete as a substitute for processing it.

## Shutdown

Both entry points handle SIGINT/SIGTERM, stop their loop, and close their queue/database resources. The worker waits for active jobs. A 30-second shutdown deadline forces exit if cleanup cannot finish; interrupted jobs can be recovered by BullMQ stalled-job handling. Long custom providers must tolerate interruption and idempotent retry.

## Verification

- 17 checks passed using real PostgreSQL in an isolated schema and simulated queue/provider behavior: publication retry, stable IDs, concurrent dispatcher locking, invalid events, in-app completion, worker duplication, preference/read checks, transient/permanent failures, exhaustion, timeout, lock recovery, failed-job reconciliation, and deletion.
- The first run found a PostgreSQL parameter-type inference issue in delivery status updates; an explicit cast fixed it and the full suite passed afterward.
- An actual BullMQ producer against unavailable Redis rejected publication within approximately five seconds and closed its connection successfully.
- The original run could not access Redis. Live Redis verification was subsequently performed on October 19, 2026; see below.
- The temporary PostgreSQL schema and test file were removed after verification. No permanent test files are retained per the user's instruction.

## Source references

Connection settings follow [BullMQ connections](https://docs.bullmq.io/guide/connections). Retry behavior follows [retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs); duplicate handling follows [job IDs](https://docs.bullmq.io/guide/jobs/job-ids). The provider deadline uses the approach described in [timeout jobs](https://docs.bullmq.io/patterns/timeout-jobs).

## Live verification on October 19, 2026

14 checks passed with real PostgreSQL and an isolated Redis 7 container: enqueue-to-worker completion, duplicate publication, terminal-state protection after queue-job removal, delayed retry, attempt exhaustion, permanent failure, provider timeout, advisory-lock contention and recovery, worker stop/start, unavailable publication endpoint and recovery, actual worker-process crash, and BullMQ stalled-job recovery. Test provider failures were injected deliberately; the actual IN_APP provider was also exercised. A normal stalled-check lease can delay crash recovery, so the crash test allows up to 60 seconds.

The isolated schemas/queues, temporary test scripts and Redis container were removed. These tests supersede the earlier live-Redis verification limitation. Email, push and DLQ remain later phases.
