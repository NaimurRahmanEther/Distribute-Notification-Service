const { pool } = require("../config/db");

// Session-level lock survives individual commits but is released on disconnect.
async function lock(id, client) {
  const { rows } = await client.query(
    "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [id]
  );
  return rows[0].locked;
}

async function unlock(id, client) {
  await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [id]);
}

async function load(id, client) {
  const { rows } = await client.query(
    `SELECT d.*, n.user_id, n.type, n.title, n.message, n.data, n.read_at,
            u.email AS recipient_email
     FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
     JOIN users u ON u.id = n.user_id
     WHERE d.id = $1`, [id]
  );
  return rows[0] || null;
}

async function start(id, client) {
  const { rows } = await client.query(
    `UPDATE notification_deliveries
     SET status = 'PROCESSING', attempt_count = attempt_count + 1,
         next_attempt_at = NULL, updated_at = NOW()
     WHERE id = $1 RETURNING *`, [id]
  );
  return rows[0];
}

async function finish(id, status, error, delayMs, providerMessageId, client) {
  await client.query(
    `UPDATE notification_deliveries
     SET status = $2::varchar, last_error = $3, provider_message_id = $5,
         next_attempt_at = CASE WHEN $2 = 'RETRYING'
           THEN NOW() + ($4 * INTERVAL '1 millisecond') ELSE NULL END,
         sent_at = CASE WHEN $2 = 'SENT' THEN NOW() ELSE sent_at END,
         updated_at = NOW()
     WHERE id = $1`, [id, status, error, delayMs, providerMessageId]
  );
}

async function pendingPublished(afterId = null) {
  const { rows } = await pool.query(
    `SELECT d.id FROM notification_deliveries d
     WHERE d.status IN ('PENDING', 'RETRYING', 'PROCESSING')
       AND ($1::uuid IS NULL OR d.id > $1::uuid)
       AND EXISTS (SELECT 1 FROM notification_outbox o
                   WHERE o.delivery_id = d.id AND o.published_at IS NOT NULL)
     ORDER BY d.id LIMIT 100`, [afterId]
  );
  return rows;
}

async function createAlternative(id, record, channel, client) {
  const { rows } = await client.query(
    `INSERT INTO notification_deliveries (id, notification_id, channel, stage)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (notification_id, channel, stage) DO NOTHING
     RETURNING *`,
    [id, record.notification_id, channel, record.stage]
  );
  return rows[0];
}

module.exports = { lock, unlock, load, start, finish, pendingPublished, createAlternative };
