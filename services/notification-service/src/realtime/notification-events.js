const env = require("../config/env");
const { log } = require("../shared/utils/logger");
const { getRealtimeConnection } = require("../config/realtime");

const channel = `${env.REALTIME_PREFIX}:events`;

async function publish(userId, event, notificationId) {
  const message = { userId: String(userId), event, notificationId };
  await getRealtimeConnection().publish(channel, JSON.stringify(message));
}

async function publishUpdate(userId, event, notificationId) {
  try {
    await publish(userId, event, notificationId);
  } catch {
    // The REST write is already committed. Reconnect/refetch recovers missed updates.
    log("error", "realtime.publish_failed", { notificationId });
  }
}

module.exports = { channel, publish, publishUpdate };
