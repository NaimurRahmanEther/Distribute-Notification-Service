const { randomUUID } = require("node:crypto");
const { pool } = require("../../../config/db");
const config = require("../../../config/schedule");
const repository = require("./notification-schedule.repository");
const preferences = require("../preferences/notification-preference.service");
const presence = require("../presence/notification-presence.service");
const subscriptions = require("../subscriptions/push-subscription.repository");
const push = require("../../../config/push");
const deliveries = require("../deliveries/notification-delivery.service");
const outbox = require("../outbox/notification-outbox.service");
const { selectInitialChannel } = require("../notifications/notification.policy");

function reminderEnabled(type, stage) {
  return config.enabled && config.types.includes(type) &&
    (stage === "UNREAD_REMINDER_1" || (stage === "UNREAD_REMINDER_2" && config.maxCount === 2));
}

async function addReminders(notification, client) {
  if (!config.enabled || !config.types.includes(notification.type)) {
    return;
  }
  const base = Date.now();
  await repository.create(randomUUID(), notification.id, "UNREAD_REMINDER_1", new Date(base + config.firstMs), client);
  if (config.maxCount === 2) {
    await repository.create(randomUUID(), notification.id, "UNREAD_REMINDER_2", new Date(base + config.secondMs), client);
  }
}

async function addInitial(notification, client) {
  await repository.create(randomUUID(), notification.id, "INITIAL", notification.scheduled_at, client);
}

async function selectReminderChannel(notification, stage, settings, client) {
  if (stage === "UNREAD_REMINDER_1") {
    if (settings.PUSH && push.isConfigured()) {
      const devices = await subscriptions.listForUser(notification.user_id, client);
      if (devices.length) {
        return "PUSH";
      }
    }
    return null;
  }
  return settings.EMAIL ? "EMAIL" : null;
}

async function processSchedule(id) {
  const client = await pool.connect();
  let connectionError;
  try {
    await client.query("BEGIN");
    // Lock notification before schedule, matching the read/cancel transaction order.
    const notification = await repository.lockNotification(id, client);
    const schedule = await repository.findLocked(id, client);
    if (!notification || !schedule || schedule.status !== "PENDING") {
      await client.query("COMMIT");
      return {};
    }
    const dueAt = new Date(schedule.due_at).getTime();
    if (dueAt > Date.now()) {
      await client.query("COMMIT");
      return { delayUntil: dueAt };
    }
    const initial = schedule.stage === "INITIAL";
    if (notification.read_at || (!initial && !reminderEnabled(notification.type, schedule.stage))) {
      await repository.finish(id, "CANCELLED", "READ_OR_REMINDERS_DISABLED", client);
      await client.query("COMMIT");
      return {};
    }
    if (!initial && await repository.hasEarlierPending(notification.id, schedule.stage, client)) {
      const next = await repository.postpone(id, config.recheckMs, client);
      await client.query("COMMIT");
      return { delayUntil: new Date(next).getTime() };
    }
    const settings = await preferences.getMine(notification.user_id, client);
    const activity = await presence.getForUser(notification.user_id);
    let channel;
    if (initial) {
      channel = selectInitialChannel(settings, activity.active);
    } else if (!activity.active) {
      channel = await selectReminderChannel(notification, schedule.stage, settings, client);
    }
    if (channel) {
      const delivery = await deliveries.create({ notificationId: notification.id, channel, stage: schedule.stage }, client);
      await outbox.requestDelivery(delivery, client);
    }
    await repository.finish(id, channel ? "COMPLETED" : "CANCELLED", channel ? null : "NO_ELIGIBLE_CHANNEL", client);
    if (initial) {
      await addReminders(notification, client);
    } else if (schedule.stage === "UNREAD_REMINDER_1") {
      await repository.spreadSecond(notification.id, config.secondMs - config.firstMs, client);
    }
    await client.query("COMMIT");
    return {};
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      connectionError = rollbackError;
    }
    throw error;
  } finally {
    client.release(connectionError);
  }
}

module.exports = { addInitial, addReminders, reminderEnabled, processSchedule };
