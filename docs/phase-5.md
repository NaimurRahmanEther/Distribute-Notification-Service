# Phase 5: email delivery

Implemented October 19, 2026. Email uses Resend's HTTP API through Node's built-in `fetch`; no additional dependency or migration is needed. Existing delivery and outbox tables already store the required state. No new public route is needed.

Phase 6 now implements Browser Web Push. The historical push-unavailable behavior below is superseded by [Phase 6 routing and fallback](phase-6.md).

## Setup

Set these values in `backend/.env` for local Node processes, or root `.env` for Docker Compose:

```dotenv
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=Notifications <notifications@your-verified-domain.com>
```

Use a sender/domain allowed by your Resend account. Restart the worker after configuration changes. Run the API, outbox dispatcher and worker in separate terminals from `backend`:

```sh
npm start
npm run outbox
npm run worker
```

Compose still starts the API only; use the existing Phase 3 instructions for separate worker/dispatcher processes. Missing email credentials fail an eligible email delivery permanently; in-app delivery remains available. Configuring credentials does not automatically revive an already failed delivery.

## Flow

1. Enable `EMAIL` through the existing authenticated preferences route. It defaults to false.
2. Create a notification through the existing route or authorized internal service. The recipient is the user's database email, never a `to` field inside notification data.
3. Notification creation selects one initial channel and writes its delivery plus outbox event in one transaction.
4. The outbox dispatcher publishes to BullMQ. Before its first send attempt, the worker checks preferences and recent activity again.
5. If in-app is enabled and the user has become active, an initial email/push delivery becomes `SKIPPED`; an in-app delivery and outbox event are created atomically. Unknown presence retains the existing conservative in-app preference.
6. Push is not implemented until Phase 6. An initial push delivery falls back to email only when email is enabled and in-app was not selected. The push source becomes `SKIPPED`. The unique notification/channel/stage constraint prevents duplicate alternatives. An existing terminal alternative is not revived.
7. The email template produces plain text and escaped HTML. Resend receives the delivery UUID as `Idempotency-Key: notification/<delivery-id>`.
8. A successful response stores the provider message ID and marks the delivery `SENT`. This means provider acceptance, not inbox arrival or reading. Bounce/delivery webhooks are not implemented.

After a send attempt, the channel is kept stable: a timeout may have occurred after the provider accepted the message. Retries keep the same key. Resend retains idempotency keys for 24 hours, so this is not an unlimited exactly-once guarantee. Avoid changing sender, recipient or template while retrying an uncertain request: the provider requires the same payload for the same key.

HTTP 408, 429, server errors and concurrent-idempotency conflicts are retryable. Other rejected requests are permanent. Retry-After is respected alongside exponential backoff. Network errors and invalid success responses use bounded retries; the existing AbortController timeout cancels slow HTTP requests. Provider response details are not stored in public delivery errors.

Unread reminder scheduling remains Phase 8. This phase does not send every notification through every channel, and does not implement general failover after email retries are exhausted.

## Code reading order

1. `backend/src/config/env.js`: email credentials and sender.
2. `backend/src/modules/notification/notifications/notification.policy.js`: initial channel selection from Phase 4.
3. `backend/src/workers/delivery.repository.js`: load the recipient email and create an alternative delivery.
4. `backend/src/workers/delivery-routing.service.js`: pre-send activity check and fallback transaction.
5. `backend/src/providers/email/notification-email.template.js`: subject, text and escaped HTML.
6. `backend/src/providers/email/notification-email.provider.js`: HTTP request, idempotency and error classification.
7. `backend/src/providers/notification-provider.js`: choose the channel's provider.
8. `backend/src/workers/delivery.processor.js`: routing, timeout, attempts, retry timing and delivery result.

## Verification

14 temporary checks passed with real PostgreSQL in an isolated schema, Redis, a live BullMQ worker/outbox dispatcher, and a local HTTP server simulating Resend. Coverage included recipient selection, HTML escaping, provider IDs, duplicate suppression, uncertain-response retries with identical payload/key, permanent rejection, exhausted retries, timeout, missing credentials, disabled preferences, activity changes, initial in-app selection, push-to-email fallback, transaction rollback, Retry-After and concurrent-idempotency responses.

The test script, temporary schema and Redis container were removed afterward. No real Resend email was sent; account credentials, sender verification and real inbox delivery still require a configured live-provider check.

Provider references: [send email API](https://resend.com/docs/api-reference/emails/send-email), [API errors](https://resend.com/docs/api-reference/errors), [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
