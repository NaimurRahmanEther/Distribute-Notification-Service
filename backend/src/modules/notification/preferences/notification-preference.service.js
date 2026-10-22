const repository = require("./notification-preference.repository");

function withDefaults(rows) {
  const preferences = { IN_APP: true, EMAIL: false, PUSH: false };
  for (const row of rows) {
    preferences[row.channel] = row.enabled;
  }
  return preferences;
}

async function getMine(userId, db) {
  const rows = await repository.findForUser(userId, db);
  return withDefaults(rows);
}

async function updateMine(userId, preferences) {
  const rows = await repository.updateForUser(userId, preferences);
  return withDefaults(rows);
}

module.exports = { getMine, updateMine };
