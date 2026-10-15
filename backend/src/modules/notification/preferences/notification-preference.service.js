const repository = require("./notification-preference.repository");
const AppError = require("../../../shared/errors/AppError");

function withDefaults(rows) {
  const preferences = { IN_APP: true, EMAIL: false, PUSH: false };
  for (const row of rows) {
    preferences[row.channel] = row.enabled;
  }
  return preferences;
}

async function getMine(userId, db) {
  return withDefaults(await repository.findForUser(userId, db));
}

async function updateMine(userId, preferences) {
  try {
    return withDefaults(await repository.updateForUser(userId, preferences));
  } catch (error) {
    if (error.code === "23503" &&
        error.constraint === "notification_preferences_user_id_fkey") {
      throw new AppError("User no longer exists", 401);
    }
    throw error;
  }
}

module.exports = { getMine, updateMine };
