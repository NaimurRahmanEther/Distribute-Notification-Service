const { UnrecoverableError } = require("bullmq");

async function send(notification, delivery, { signal }) {
  signal.throwIfAborted();
  if (delivery.channel === "IN_APP") {
    // Phase 3: the notification is already available in the persisted inbox.
    // SENT means inbox availability, not Socket.IO receipt or a user reading it.
    return { providerMessageId: null };
  }
  throw new UnrecoverableError("PROVIDER_NOT_IMPLEMENTED");
}

module.exports = { send };
