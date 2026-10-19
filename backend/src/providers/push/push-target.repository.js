async function initialize(delivery, client) {
  await client.query("BEGIN");
  try {
    const result = await client.query(
      "UPDATE notification_deliveries SET push_initialized = TRUE WHERE id = $1 AND push_initialized = FALSE RETURNING id",
      [delivery.id]
    );
    if (result.rowCount) {
      await client.query(
        `INSERT INTO notification_push_targets (delivery_id, subscription_id)
         SELECT $1, id FROM notification_push_subscriptions WHERE user_id = $2`,
        [delivery.id, delivery.user_id]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function list(delivery, client) {
  const { rows } = await client.query(
    `SELECT t.*, s.endpoint, s.p256dh, s.auth FROM notification_push_targets t
     LEFT JOIN notification_push_subscriptions s ON s.id = t.subscription_id AND s.user_id = $2
     WHERE t.delivery_id = $1 ORDER BY t.attempt_count, t.subscription_id`, [delivery.id, delivery.user_id]
  );
  return rows;
}

async function start(deliveryId, subscriptionId, client) {
  await client.query(
    `UPDATE notification_push_targets SET attempt_count = attempt_count + 1, updated_at = NOW()
     WHERE delivery_id = $1 AND subscription_id = $2`, [deliveryId, subscriptionId]
  );
}

async function finish(deliveryId, subscriptionId, status, reason, client) {
  await client.query(
    `UPDATE notification_push_targets SET status = $3, last_error = $4, updated_at = NOW()
     WHERE delivery_id = $1 AND subscription_id = $2`, [deliveryId, subscriptionId, status, reason]
  );
}

async function failPending(deliveryId, client) {
  await client.query(
    `UPDATE notification_push_targets SET status = 'FAILED', last_error = 'ATTEMPTS_EXHAUSTED', updated_at = NOW()
     WHERE delivery_id = $1 AND status IN ('PENDING', 'RETRYING')`, [deliveryId]
  );
}

async function cancelPending(deliveryId, client) {
  await client.query(
    `UPDATE notification_push_targets SET status = 'CANCELLED', last_error = 'DELIVERY_SKIPPED', updated_at = NOW()
     WHERE delivery_id = $1 AND status IN ('PENDING', 'RETRYING')`, [deliveryId]
  );
}

async function summary(deliveryId, client) {
  const { rows } = await client.query(
    `SELECT count(*) FILTER (WHERE status = 'SENT')::int AS sent,
            count(*) FILTER (WHERE status IN ('PENDING', 'RETRYING'))::int AS pending
     FROM notification_push_targets WHERE delivery_id = $1`, [deliveryId]
  );
  return rows[0];
}

module.exports = { initialize, list, start, finish, failPending, cancelPending, summary };
