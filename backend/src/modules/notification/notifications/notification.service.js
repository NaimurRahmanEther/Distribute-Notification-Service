const { randomUUID } = require("node:crypto");
const repository = require("./notification.repository");
const AppError = require("../../../shared/errors/AppError");
const { pool } = require("../../../config/db");
const preferences = require("../preferences/notification-preference.service");
const deliveries = require("../deliveries/notification-delivery.service");
const outbox = require("../outbox/notification-outbox.service");
const { selectInitialChannel } = require("./notification.policy");
const presence = require("../presence/notification-presence.service");
const events = require("../../../realtime/notification-events");
const schedules = require("../schedules/notification-schedule.service");
const scheduleRepository = require("../schedules/notification-schedule.repository");

function requireNotification(notification) {
  if (!notification) {
    throw new AppError("Notification not found", 404);
  }
  return notification;
}

async function createForSelf(userId, input) {
  const activity = await presence.getForUser(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.requestId) {
      const existing = await repository.findRequest(userId, input, client);
      if (existing) {
        const { matches_input: matchesInput, ...notification } = existing;
        if (!matchesInput) {
          throw new AppError("requestId was already used with different notification data", 409);
        }
        await client.query("COMMIT");
        return notification;
      }
    }
    if (input.scheduledAt && new Date(input.scheduledAt).getTime() <= Date.now()) {
      throw new AppError("scheduledAt must be in the future", 400);
    }
    const settings = await preferences.getMine(userId, client);
    const notification = await repository.create({
      id: randomUUID(),
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
      scheduledAt: input.scheduledAt,
      requestId: input.requestId,
    }, client);

    if (notification.scheduled_at) {
      await schedules.addInitial(notification, client);
    } else {
      const channel = selectInitialChannel(settings, activity.active);
      if (channel) {
        const delivery = await deliveries.create({ notificationId: notification.id, channel }, client);
        await outbox.requestDelivery(delivery, client);
      }
      await schedules.addReminders(notification, client);
    }

    await client.query("COMMIT");
    return notification;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23503" &&
        error.constraint === "notifications_user_id_fkey") {
      throw new AppError("User no longer exists", 401);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function listMine(userId, filters) {
  const { notifications, total } = await repository.listForUser(userId, filters);
  return {
    notifications,
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

async function getMine(userId, id) {
  return requireNotification(await repository.findForUser(userId, id));
}

async function markMineRead(userId, id) {
  const notification = await persistRead(userId, id);
  await events.publishUpdate(userId, "notification:read", id);
  return notification;
}

async function markAllMineRead(userId) {
  const updatedCount = await persistRead(userId);
  await events.publishUpdate(userId, "notifications:read-all");
  return { updatedCount };
}

async function persistRead(userId, id = null) {
  const client = await pool.connect();
  let connectionError;
  try {
    await client.query("BEGIN");
    let result;
    if (id) {
      result = requireNotification(await repository.markReadForUser(userId, id, client));
    } else {
      result = await repository.markAllReadForUser(userId, client);
    }
    await scheduleRepository.cancelRead(userId, id, client);
    await client.query("COMMIT");
    return result;
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

async function deleteMine(userId, id) {
  const notification = requireNotification(await repository.deleteForUser(userId, id));
  await events.publishUpdate(userId, "notification:deleted", id);
  return notification;
}

module.exports = {
  createForSelf, listMine, getMine, markMineRead, markAllMineRead, deleteMine,
};
