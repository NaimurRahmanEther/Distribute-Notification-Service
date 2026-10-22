const { pool } = require("../../../config/db");

async function list({ page, limit }) {
  const { rows } = await pool.query(
    `SELECT f.*, d.channel, d.stage, d.status AS delivery_status
     FROM notification_dead_letters f JOIN notification_deliveries d ON d.id = f.delivery_id
     ORDER BY f.failed_at DESC, f.id DESC LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]
  );
  return rows;
}

async function findById(id, db = pool) {
  const { rows } = await db.query(
    `SELECT f.*, d.channel, d.stage, d.status AS delivery_status
     FROM notification_dead_letters f JOIN notification_deliveries d ON d.id = f.delivery_id
     WHERE f.id = $1`, [id]
  );
  return rows[0] || null;
}

async function targetsForDelivery(deliveryId, db = pool) {
  const { rows } = await db.query(
    `SELECT subscription_id, status, attempt_count, last_error, updated_at
     FROM notification_push_targets WHERE delivery_id = $1 ORDER BY subscription_id`, [deliveryId]
  );
  return rows;
}

async function resetFailedTargets(deliveryId, client) {
  const result = await client.query(
    `UPDATE notification_push_targets t SET status = 'PENDING', last_error = NULL, updated_at = NOW()
     FROM notification_push_subscriptions s, notification_deliveries d, notifications n
     WHERE t.delivery_id = $1 AND t.status = 'FAILED' AND s.id = t.subscription_id
       AND d.id = t.delivery_id AND n.id = d.notification_id AND n.user_id = s.user_id`, [deliveryId]
  );
  return result.rowCount;
}

async function resetDelivery(id, client) {
  const { rows } = await client.query(
    `UPDATE notification_deliveries SET status = 'PENDING', attempt_count = 0,
       replay_count = replay_count + 1, last_error = NULL, next_attempt_at = NULL, updated_at = NOW()
     WHERE id = $1 RETURNING *`, [id]
  );
  return rows[0];
}

async function markReplayed(id, adminId, client) {
  await client.query(
    "UPDATE notification_dead_letters SET replayed_at = NOW(), replayed_by = $2 WHERE id = $1", [id, adminId]
  );
}

async function claimNext(client) {
  const { rows } = await client.query(
    `SELECT * FROM notification_dead_letters WHERE published_at IS NULL AND next_publish_at <= NOW()
     ORDER BY next_publish_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`
  );
  return rows[0];
}

async function markPublished(id, client) {
  await client.query(
    "UPDATE notification_dead_letters SET published_at = NOW(), publication_attempts = publication_attempts + 1 WHERE id = $1", [id]
  );
}

async function retryPublication(id, delayMs, client) {
  await client.query(
    `UPDATE notification_dead_letters SET publication_attempts = publication_attempts + 1,
     next_publish_at = NOW() + ($2 * INTERVAL '1 millisecond') WHERE id = $1`, [id, delayMs]
  );
}

module.exports = { list, findById, targetsForDelivery, resetFailedTargets, resetDelivery, markReplayed, claimNext, markPublished, retryPublication };
