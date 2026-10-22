const { pool } = require("../../config/db");

async function ready() {
  // A running server must not accept work against an unmigrated database.
  const { rows } = await pool.query({
    text: "SELECT COUNT(*)::int AS applied FROM schema_migrations WHERE name IN ('011_add_notification_scheduling','012_create_notification_schedules')",
    query_timeout: 3000,
  });
  return rows[0].applied === 2;
}

async function metrics() {
  const { rows } = await pool.query({
    text: `SELECT
      (SELECT COUNT(*)::int FROM notification_outbox WHERE published_at IS NULL) AS outbox_pending,
      (SELECT COALESCE(EXTRACT(EPOCH FROM NOW()-MIN(created_at)),0)::float FROM notification_outbox WHERE published_at IS NULL) AS outbox_oldest_seconds,
      (SELECT COUNT(*)::int FROM notification_deliveries WHERE status='FAILED') AS deliveries_failed,
      (SELECT COUNT(*)::int FROM notification_deliveries WHERE status='RETRYING') AS deliveries_retrying,
      (SELECT COALESCE(SUM(GREATEST(attempt_count-1,0)),0)::float FROM notification_deliveries) AS retained_retry_attempts,
      (SELECT COALESCE(EXTRACT(EPOCH FROM NOW()-MIN(created_at)),0)::float FROM notification_deliveries WHERE status IN ('PENDING','RETRYING','PROCESSING')) AS delivery_oldest_seconds,
      (SELECT COUNT(*)::int FROM notification_dead_letters WHERE replayed_at IS NULL) AS dlq_unreplayed,
      (SELECT COUNT(*)::int FROM notification_dead_letters WHERE published_at IS NULL) AS dlq_unpublished,
      (SELECT COUNT(*)::int FROM notification_schedules WHERE status='PENDING' AND due_at<=NOW()) AS schedules_overdue,
      (SELECT COALESCE(jsonb_object_agg(status,total),'{}'::jsonb) FROM
        (SELECT status,COUNT(*)::int AS total FROM notification_schedules WHERE stage<>'INITIAL' GROUP BY status) counts) AS reminder_schedules,
      (SELECT COALESCE(jsonb_object_agg(status,total),'{}'::jsonb) FROM
        (SELECT status,COUNT(*)::int AS total FROM notification_deliveries WHERE stage<>'INITIAL' GROUP BY status) counts) AS reminder_deliveries`,
    query_timeout: 5000,
  });
  return rows[0];
}

module.exports = { ready, metrics };
