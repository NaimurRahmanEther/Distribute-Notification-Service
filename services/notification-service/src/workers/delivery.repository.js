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

async function lockForReplay(id, client) {
  const { rows } = await client.query(
    "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [id]
  );
  return rows[0].locked;
}

async function load(id, client) {
  const { rows } = await client.query(
    `SELECT d.*, n.user_id, n.type, n.title, n.message, n.data, n.read_at, n.scheduled_at,
            u.email AS recipient_email
     FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
     JOIN notification_recipients u ON u.id = n.user_id
     WHERE d.id = $1`, [id]
  );
  return rows[0] || null;
}

async function start(id, client) {
  const { rows } = await client.query(
    `UPDATE notification_deliveries d
     SET status = 'PROCESSING', attempt_count = attempt_count + 1,
         next_attempt_at = NULL, updated_at = NOW()
     WHERE d.id = $1 AND d.status IN ('PENDING', 'RETRYING', 'PROCESSING')
       AND EXISTS(SELECT 1 FROM notifications n WHERE n.id=d.notification_id
         AND (n.read_at IS NULL OR (d.stage='INITIAL' AND d.replay_count=0 AND n.scheduled_at IS NULL)))
     RETURNING d.*`, [id]
  );
  return rows[0];
}

async function republishMissing(id, replayCount, client) {
  await client.query(
    `UPDATE notification_outbox SET published_at=NULL, next_attempt_at=NOW(), last_error='QUEUE_JOB_MISSING'
     WHERE delivery_id=$1 AND published_at IS NOT NULL
       AND COALESCE(payload->>'replayCount','0')=$2::text`, [id, replayCount]
  );
}

async function finish(id, status, error, delayMs, providerMessageId, client) {
  await client.query(
    `WITH updated AS (UPDATE notification_deliveries
     SET status = $2::varchar, last_error = $3, provider_message_id = $5,
         next_attempt_at = CASE WHEN $2 = 'RETRYING'
           THEN NOW() + ($4 * INTERVAL '1 millisecond') ELSE NULL END,
         sent_at = CASE WHEN $2 = 'SENT' THEN NOW() ELSE sent_at END,
         updated_at = NOW()
     WHERE id = $1 RETURNING *)
     INSERT INTO notification_dead_letters(delivery_id, replay_count, reason, attempt_count)
     SELECT id, replay_count, COALESCE($3, 'TERMINAL_FAILURE'), attempt_count FROM updated
     WHERE status = 'FAILED' OR (status = 'SENT' AND $3 = 'SOME_PUSH_TARGETS_FAILED')
     ON CONFLICT (delivery_id, replay_count) DO NOTHING`, [id, status, error, delayMs, providerMessageId]
  );
}

async function pendingPublished(afterId = null) {
  const { rows } = await pool.query(
    `SELECT d.id, d.replay_count FROM notification_deliveries d
     WHERE d.status IN ('PENDING', 'RETRYING', 'PROCESSING')
       AND ($1::uuid IS NULL OR d.id > $1::uuid)
       AND EXISTS (SELECT 1 FROM notification_outbox o
                   WHERE o.delivery_id = d.id AND o.published_at IS NOT NULL
                     AND COALESCE(o.payload->>'replayCount', '0') = d.replay_count::text)
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

module.exports = { lock, unlock, lockForReplay, load, start, finish, pendingPublished, republishMissing, createAlternative };
