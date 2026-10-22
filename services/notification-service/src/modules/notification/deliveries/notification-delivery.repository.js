const { pool } = require("../../../config/db");

// Pass a shared client to include this insert in the service transaction.
async function create(
  { id, notificationId, channel, stage = "INITIAL", nextAttemptAt = null },
  db
) {
  const { rows } = await db.query(
    `INSERT INTO notification_deliveries (
       id, notification_id, channel, stage, next_attempt_at
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, notificationId, channel, stage, nextAttemptAt]
  );

  return rows[0];
}

// Public reads enforce ownership and omit provider/internal error details.
async function findForUser(userId, id) {
  const { rows } = await pool.query(
    `SELECT d.id, d.notification_id, d.channel, d.stage, d.status,
            d.attempt_count, d.next_attempt_at, d.sent_at, d.created_at, d.updated_at
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     WHERE d.id = $1 AND n.user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function listForUser(userId, notificationId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.notification_id, d.channel, d.stage, d.status,
            d.attempt_count, d.next_attempt_at, d.sent_at, d.created_at, d.updated_at
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     WHERE d.notification_id = $1 AND n.user_id = $2
     ORDER BY d.created_at ASC, d.id ASC`,
    [notificationId, userId]
  );
  return rows;
}

module.exports = {
  findForUser,
  listForUser,
  create,
};
