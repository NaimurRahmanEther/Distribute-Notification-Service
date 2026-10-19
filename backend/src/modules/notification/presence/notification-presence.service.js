const repository = require("./notification-presence.repository");

async function getForUser(userId) {
  try {
    return await repository.getForUser(userId);
  } catch {
    // Unknown presence must not trigger extra external notifications.
    return { online: false, active: true, unknown: true };
  }
}

module.exports = { getForUser, touch: repository.touch, remove: repository.remove };
