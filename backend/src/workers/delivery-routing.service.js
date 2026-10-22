const { randomUUID } = require("node:crypto");
const repository = require("./delivery.repository");
const presence = require("../modules/notification/presence/notification-presence.service");
const outbox = require("../modules/notification/outbox/notification-outbox.service");
const push = require("../config/push");
const subscriptions = require("../modules/notification/subscriptions/push-subscription.repository");
const preferences = require("../modules/notification/preferences/notification-preference.service");
const pushTargets = require("../providers/push/push-target.repository");

async function redirect(record, channel, reason, client) {
  await client.query("BEGIN");
  try {
    const delivery = await repository.createAlternative(randomUUID(), record, channel, client);
    if (delivery) {
      await outbox.requestDelivery(delivery, client);
    }
    if (record.channel === "PUSH") {
      await pushTargets.cancelPending(record.id, client);
    }
    await repository.finish(record.id, "SKIPPED", reason, 0, null, client);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function fallbackFromPush(record, client) {
  if (record.channel !== "PUSH" || record.stage !== "INITIAL") {
    return false;
  }
  const settings = await preferences.getMine(record.user_id, client);
  if (!settings.EMAIL) {
    return false;
  }
  return redirect(record, "EMAIL", "PUSH_UNAVAILABLE", client);
}

async function redirectIfNeeded(record, settings, client) {
  // Once a send was attempted, keep the same channel/key for uncertain outcomes.
  if (record.stage !== "INITIAL" || record.attempt_count > 0 || record.channel === "IN_APP") {
    return false;
  }

  let channel;
  let reason;
  if (settings.IN_APP) {
    const activity = await presence.getForUser(record.user_id);
    if (activity.active) {
      channel = "IN_APP";
      reason = "IN_APP_PREFERRED";
    }
  }
  if (!channel && record.channel === "PUSH" && settings.EMAIL) {
    const devices = await subscriptions.listForUser(record.user_id, client);
    if (!push.isConfigured() || !devices.length) {
      channel = "EMAIL";
      reason = "PUSH_UNAVAILABLE";
    }
  }
  if (!channel) {
    return false;
  }

  return redirect(record, channel, reason, client);
}

module.exports = { redirectIfNeeded, fallbackFromPush };
