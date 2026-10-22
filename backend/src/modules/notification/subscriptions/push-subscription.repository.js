const { pool } = require("../../../config/db");

async function lockUser(userId, client) {
  await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
}

async function findByEndpoint(endpoint, client) {
  const { rows } = await client.query("SELECT * FROM notification_push_subscriptions WHERE endpoint = $1", [endpoint]);
  return rows[0];
}

async function listForUser(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT id, created_at FROM notification_push_subscriptions WHERE user_id = $1 ORDER BY created_at, id", [userId]
  );
  return rows;
}

async function create(id, userId, input, client) {
  const { rows } = await client.query(
    `INSERT INTO notification_push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [id, userId, input.endpoint, input.keys.p256dh, input.keys.auth]
  );
  return rows[0];
}

async function removeForUser(userId, id, db = pool) {
  const result = await db.query("DELETE FROM notification_push_subscriptions WHERE id = $1 AND user_id = $2", [id, userId]);
  return result.rowCount > 0;
}

module.exports = { lockUser, findByEndpoint, listForUser, create, removeForUser };
