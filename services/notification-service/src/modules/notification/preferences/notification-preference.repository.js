const { pool } = require("../../../config/db");

async function findForUser(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT channel, enabled FROM notification_preferences WHERE user_id = $1`,
    [userId]
  );
  return rows;
}

// One statement updates all three preferences atomically.
async function updateForUser(userId, preferences, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO notification_preferences (user_id, channel, enabled)
     VALUES ($1, 'IN_APP', $2), ($1, 'EMAIL', $3), ($1, 'PUSH', $4)
     ON CONFLICT (user_id, channel)
     DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
     RETURNING channel, enabled`,
    [userId, preferences.IN_APP, preferences.EMAIL, preferences.PUSH]
  );
  return rows;
}

module.exports = { findForUser, updateForUser };
