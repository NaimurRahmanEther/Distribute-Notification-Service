async function create({ id, deliveryId, payload }, client) {
  const { rows } = await client.query(
    `INSERT INTO notification_outbox (id, delivery_id, event_type, payload)
     VALUES ($1, $2, 'DELIVERY_REQUESTED', $3::jsonb)
     RETURNING *`,
    [id, deliveryId, JSON.stringify(payload)]
  );
  return rows[0];
}

async function claimNext(client) {
  const { rows } = await client.query(
    `SELECT * FROM notification_outbox
     WHERE published_at IS NULL AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at, id
     LIMIT 1 FOR UPDATE SKIP LOCKED`
  );
  return rows[0] || null;
}

async function markPublished(id, client) {
  await client.query(
    `UPDATE notification_outbox
     SET published_at = NOW(), attempt_count = attempt_count + 1, last_error = NULL
     WHERE id = $1`, [id]
  );
}

async function markPublicationFailed(id, delayMs, permanent, client) {
  await client.query(
    `UPDATE notification_outbox
     SET attempt_count = attempt_count + 1,
         last_error = $2,
         next_attempt_at = CASE WHEN $3 THEN 'infinity'::timestamptz
           ELSE NOW() + ($4 * INTERVAL '1 millisecond') END
     WHERE id = $1`,
    [id, permanent ? "INVALID_EVENT: manual repair required" : "QUEUE_PUBLICATION_FAILED", permanent, delayMs]
  );
}

module.exports = { create, claimNext, markPublished, markPublicationFailed };
