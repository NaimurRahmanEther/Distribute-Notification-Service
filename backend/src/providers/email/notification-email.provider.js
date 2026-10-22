const { UnrecoverableError } = require("bullmq");
const env = require("../../config/env");
const { createEmail } = require("./notification-email.template");

function retryDelay(value) {
  if (!value) {
    return 0;
  }
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
}

async function send(notification, delivery, { signal, idempotencyKey }) {
  signal.throwIfAborted();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new UnrecoverableError("EMAIL_NOT_CONFIGURED");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal,
    redirect: "error",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `notification/${idempotencyKey}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [notification.recipient_email],
      ...createEmail(notification),
    }),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const concurrentRequest = response.status === 409 && result.name === "concurrent_idempotent_requests";
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || concurrentRequest;
    if (!retryable) {
      throw new UnrecoverableError("EMAIL_REQUEST_REJECTED");
    }
    const error = new Error("EMAIL_PROVIDER_UNAVAILABLE");
    error.retryAfterMs = retryDelay(response.headers.get("retry-after"));
    throw error;
  }

  if (typeof result.id !== "string" || !result.id) {
    throw new Error("EMAIL_RESPONSE_INVALID");
  }
  return { providerMessageId: result.id };
}

module.exports = { send };
