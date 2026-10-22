async function create(id, notificationId, stage, dueAt, client) {
  await client.query(
    `INSERT INTO notification_schedules(id, notification_id, stage, due_at)
     VALUES($1,$2,$3,$4) ON CONFLICT(notification_id, stage) DO NOTHING`,
    [id, notificationId, stage, dueAt]
  );
}

async function lockNotification(scheduleId, client) {
  const { rows } = await client.query(
    `SELECT n.* FROM notifications n JOIN notification_schedules s ON s.notification_id = n.id
     WHERE s.id = $1 FOR UPDATE OF n`, [scheduleId]
  );
  return rows[0];
}

async function findLocked(id, client) {
  const { rows } = await client.query("SELECT * FROM notification_schedules WHERE id = $1 FOR UPDATE", [id]);
  return rows[0];
}

async function finish(id, status, reason, client) {
  await client.query(
    "UPDATE notification_schedules SET status=$2, last_error=$3, completed_at=NOW() WHERE id=$1", [id, status, reason]
  );
}

async function hasEarlierPending(notificationId, stage, client) {
  const { rows } = await client.query(
    `SELECT EXISTS(SELECT 1 FROM notification_schedules WHERE notification_id=$1 AND stage<$2 AND status='PENDING')
       OR EXISTS(SELECT 1 FROM notification_deliveries WHERE notification_id=$1 AND stage<$2
                 AND status IN ('PENDING','RETRYING','PROCESSING')) AS pending`, [notificationId, stage]
  );
  return rows[0].pending;
}

async function postpone(id, delayMs, client) {
  const { rows } = await client.query(
    "UPDATE notification_schedules SET due_at=NOW()+($2 * INTERVAL '1 millisecond'), next_check_at=NOW() WHERE id=$1 RETURNING due_at", [id, delayMs]
  );
  return rows[0].due_at;
}

async function spreadSecond(notificationId, gapMs, client) {
  await client.query(
    `UPDATE notification_schedules SET due_at=GREATEST(due_at, NOW()+($2 * INTERVAL '1 millisecond'))
     WHERE notification_id=$1 AND stage='UNREAD_REMINDER_2' AND status='PENDING'`, [notificationId, gapMs]
  );
}

async function claimForPublication(client) {
  const { rows } = await client.query(
    `SELECT * FROM notification_schedules WHERE status='PENDING' AND next_check_at<=NOW()
     ORDER BY next_check_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`
  );
  return rows[0];
}

async function checked(id, delayMs, error, client) {
  await client.query(
    `UPDATE notification_schedules SET next_check_at=NOW()+($2 * INTERVAL '1 millisecond'),
       publication_attempts=publication_attempts+1, last_error=$3 WHERE id=$1`, [id, delayMs, error]
  );
}

async function cancelRead(userId, notificationId, client) {
  await client.query(
    `UPDATE notification_schedules s SET status='CANCELLED', last_error='NOTIFICATION_READ', completed_at=NOW()
     FROM notifications n WHERE s.notification_id=n.id AND n.user_id=$1 AND n.read_at IS NOT NULL
       AND ($2::uuid IS NULL OR n.id=$2) AND s.status='PENDING'`, [userId, notificationId]
  );
  await client.query(
    `WITH cancelled AS (
       UPDATE notification_deliveries d SET status='CANCELLED', last_error='NOTIFICATION_READ',
         next_attempt_at=NULL, updated_at=NOW()
       FROM notifications n WHERE d.notification_id=n.id AND n.user_id=$1 AND n.read_at IS NOT NULL
         AND ($2::uuid IS NULL OR n.id=$2) AND d.status IN ('PENDING','RETRYING')
         AND (d.stage<>'INITIAL' OR n.scheduled_at IS NOT NULL OR d.replay_count>0)
       RETURNING d.id)
     UPDATE notification_push_targets t SET status='CANCELLED', last_error='NOTIFICATION_READ', updated_at=NOW()
     FROM cancelled c WHERE t.delivery_id=c.id AND t.status IN ('PENDING','RETRYING')`, [userId, notificationId]
  );
}

module.exports = { create, lockNotification, findLocked, finish, hasEarlierPending, postpone, spreadSecond, claimForPublication, checked, cancelRead };
