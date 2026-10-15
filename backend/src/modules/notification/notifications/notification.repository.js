const { pool } = require("../../../config/db");

async function create({ id, userId, type, title, message, data = {} }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO notifications (id, user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [id, userId, type, title, message, JSON.stringify(data)]
  );
  return rows[0];
}

async function listForUser(
  userId,
  { page = 1, limit = 20, unreadOnly = false, type } = {}
) {
  const values = [userId];
  const conditions = ["user_id = $1"];
  if (unreadOnly) conditions.push("read_at IS NULL");
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
    "SELECT * FROM notifications WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return rows[0] || null;
}

async function markReadForUser(userId, id) {
  const { rows } = await pool.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

async function markAllReadForUser(userId) {
  const result = await pool.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
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
  create, listForUser, findForUser, markReadForUser,
  markAllReadForUser, deleteForUser,
};
