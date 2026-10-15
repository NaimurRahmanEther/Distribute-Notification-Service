const { pool } = require("../../../config/db");

async function create({ id, deliveryId, payload }, client) {
  const { rows } = await client.query(
    `INSERT INTO notification_outbox (id, delivery_id, event_type, payload)
     VALUES ($1, $2, 'DELIVERY_REQUESTED', $3::jsonb)
     RETURNING *`,
    [id, deliveryId, JSON.stringify(payload)]
  );
  return rows[0];
}

// Internal inspection only. Dispatcher claiming/publication belongs to Phase 3.
async function findById(id, db = pool) {
  const { rows } = await db.query(
    "SELECT * FROM notification_outbox WHERE id = $1", [id]
  );
  return rows[0] || null;
}

module.exports = { create, findById };
