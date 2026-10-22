const { pool } = require("../../../config/db");

async function create({ id, userId, type, title, message, data = {}, scheduledAt = null, requestId = null }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO notifications (id, user_id, type, title, message, data, scheduled_at, request_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING *`,
    [id, userId, type, title, message, JSON.stringify(data), scheduledAt, requestId]
  );
  return rows[0];
}

async function findRequest(userId, input, client) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`create:${userId}:${input.requestId.toLowerCase()}`]);
  const { rows } = await client.query(
    `SELECT *, (type = $3 AND title = $4 AND message = $5 AND data = $6::jsonb
       AND scheduled_at IS NOT DISTINCT FROM $7::timestamptz) AS matches_input
     FROM notifications WHERE user_id = $1 AND request_id = $2`,
    [userId, input.requestId, input.type, input.title, input.message, JSON.stringify(input.data === undefined ? {} : input.data), input.scheduledAt || null]
  );
  return rows[0];
}

async function listForUser(
  userId,
  { page = 1, limit = 20, unreadOnly = false, type } = {}
) {
  const values = [userId];
  const conditions = ["user_id = $1", "(scheduled_at IS NULL OR scheduled_at <= NOW())"];
  if (unreadOnly) {
    conditions.push("read_at IS NULL");
  }
  if (type) {
    values.push(type);
    conditions.push(`type = $${values.length}`);
  }

  // Interpolate only internal SQL fragments; parameterize every input value.
  const where = conditions.join(" AND ");
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${where}`,
    values
  );

  const { rows } = await pool.query(
    `SELECT * FROM notifications
     WHERE ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    notifications: rows,
    total: Number(countResult.rows[0].total),
  };
}

async function findForUser(userId, id) {
  const { rows } = await pool.query(
    "SELECT * FROM notifications WHERE id = $1 AND user_id = $2 AND (scheduled_at IS NULL OR scheduled_at <= NOW())",
    [id, userId]
  );
  return rows[0] || null;
}

async function markReadForUser(userId, id, db = pool) {
  const { rows } = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2 AND (scheduled_at IS NULL OR scheduled_at <= NOW()) RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

async function markAllReadForUser(userId, db = pool) {
  const result = await db.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL AND (scheduled_at IS NULL OR scheduled_at <= NOW())`,
    [userId]
  );
  return result.rowCount;
}

async function deleteForUser(userId, id) {
  const { rows } = await pool.query(
    "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
    [id, userId]
  );
  return rows[0] || null;
}

module.exports = {
  create, findRequest, listForUser, findForUser, markReadForUser,
  markAllReadForUser, deleteForUser,
};
