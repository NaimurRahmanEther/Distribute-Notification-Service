const events = require("../../realtime/notification-events");

async function send(notification, delivery, { signal }) {
  signal.throwIfAborted();
  await events.publish(notification.user_id, "notification:new", notification.notification_id);
  // SENT means persisted inbox + live publication, not client receipt or reading.
  return { providerMessageId: null };
}

module.exports = { send };
