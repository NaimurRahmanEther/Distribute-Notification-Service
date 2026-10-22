const { pool } = require("../../../config/db");

async function sync(user, db = pool) {
  await db.query(
    `INSERT INTO notification_recipients(id,email) VALUES($1,$2)
     ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,updated_at=NOW()
     WHERE notification_recipients.email IS DISTINCT FROM EXCLUDED.email`,
    [user.userId, user.email]
  );
}

module.exports = { sync };
