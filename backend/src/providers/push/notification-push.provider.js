const webpush = require("web-push");
const { UnrecoverableError } = require("bullmq");
const env = require("../../config/env");
const { isConfigured, isAllowedEndpoint } = require("../../config/push");
const targets = require("./push-target.repository");
const subscriptions = require("../../modules/notification/subscriptions/push-subscription.repository");

function unavailable() {
  const error = new UnrecoverableError("PUSH_UNAVAILABLE");
  error.pushUnavailable = true;
  return error;
}

async function send(notification, delivery, { signal, client }) {
  signal.throwIfAborted();
  if (!isConfigured()) {
    throw unavailable();
  }
  await targets.initialize(delivery, client);
  const devices = await targets.list(delivery, client);
  // Keep encrypted payload comfortably below the common 4KB push limit.
  const payload = JSON.stringify({
    notificationId: notification.notification_id,
    title: Array.from(notification.title).slice(0, 100).join(""),
    body: Array.from(notification.message).slice(0, 300).join(""),
  });
  let retryAfterMs = 0;
  for (const device of devices) {
    if (!["PENDING", "RETRYING"].includes(device.status)) {
      continue;
    }
    signal.throwIfAborted();
    if (!device.endpoint) {
      await targets.finish(delivery.id, device.subscription_id, "CANCELLED", "SUBSCRIPTION_REMOVED", client);
      continue;
    }
    if (!isAllowedEndpoint(device.endpoint)) {
      await targets.finish(delivery.id, device.subscription_id, "FAILED", "UNSUPPORTED_ENDPOINT", client);
      continue;
    }
    let details;
    try {
      details = webpush.generateRequestDetails({
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      }, payload, {
        TTL: 3600,
        topic: delivery.id.replace(/-/g, ""),
        vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
      });
    } catch {
      throw new UnrecoverableError("PUSH_CONFIGURATION_INVALID");
    }
    await targets.start(delivery.id, device.subscription_id, client);
    let response;
    try {
      response = await fetch(details.endpoint, {
        method: details.method,
        headers: details.headers,
        body: details.body,
        signal,
        redirect: "error",
      });
    } catch {
      await targets.finish(delivery.id, device.subscription_id, "RETRYING", "PUSH_NETWORK_ERROR", client);
      signal.throwIfAborted();
      continue;
    }
    // No provider response body or subscription URL belongs in logs or public errors.
    if (response.body) {
      await response.body.cancel();
    }
    if (response.ok) {
      await targets.finish(delivery.id, device.subscription_id, "SENT", null, client);
    } else if ([404, 410].includes(response.status)) {
      await subscriptions.removeForUser(delivery.user_id, device.subscription_id, client);
      await targets.finish(delivery.id, device.subscription_id, "CANCELLED", "SUBSCRIPTION_EXPIRED", client);
    } else if ([408, 429].includes(response.status) || response.status >= 500) {
      const header = response.headers.get("retry-after");
      const seconds = Number(header);
      const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
      if (Number.isFinite(wait)) {
        retryAfterMs = Math.max(retryAfterMs, wait);
      }
      await targets.finish(delivery.id, device.subscription_id, "RETRYING", "PUSH_TEMPORARY_FAILURE", client);
    } else {
      await targets.finish(delivery.id, device.subscription_id, "FAILED", "PUSH_REQUEST_REJECTED", client);
    }
  }
  const result = await targets.summary(delivery.id, client);
  if (result.pending) {
    const error = new Error("PUSH_TEMPORARY_FAILURE");
    error.retryAfterMs = retryAfterMs;
    throw error;
  }
  if (!result.sent) {
    throw unavailable();
  }
  return { providerMessageId: null };
}

module.exports = { send };
