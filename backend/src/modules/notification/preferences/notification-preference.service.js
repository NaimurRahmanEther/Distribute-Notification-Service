const repository = require("./notification-preference.repository");

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
  return withDefaults(await repository.updateForUser(userId, preferences));
}

module.exports = { getMine, updateMine };
