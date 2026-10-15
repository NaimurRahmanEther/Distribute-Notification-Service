const { pool } = require("../../config/db");

async function findByEmail(email) {
  const query = `
    SELECT
      id,
      full_name,
      email,
      password_hash,
      user_role,
      created_at
    FROM users
    WHERE email = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [email]);

  return rows[0] || null;
}

async function createUser({ fullName, email, passwordHash }) {
  const query = `
    INSERT INTO users (full_name, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, full_name, email, user_role, created_at
  `;

  const { rows } = await pool.query(query, [
    fullName,
    email,
    passwordHash,
  ]);

  return rows[0] || null;
}

async function findById(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, user_role FROM users WHERE id = $1`,
    [userId]
  );

  return rows[0] || null;
}

/**
 * Revoke old sessions and create a new session atomically.
 * Locking the user row serializes concurrent logins for that user.
 */
async function replaceActiveSession({
  sessionId,
  userId,
  refreshTokenHash,
  expiresAt,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    await client.query(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );

    const { rows } = await client.query(
      `INSERT INTO user_sessions (
         id,
         user_id,
         refresh_token_hash,
         expires_at
       )
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, expires_at`,
      [sessionId, userId, refreshTokenHash, expiresAt]
    );

    await client.query("COMMIT");

    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findActiveSession({ sessionId, userId }) {
  const query = `
    SELECT
      id,
      user_id,
      refresh_token_hash,
      expires_at,
      revoked_at
    FROM user_sessions
    WHERE id = $1
      AND user_id = $2
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [sessionId, userId]);

  return rows[0] || null;
}

async function revokeSession({ sessionId, userId, refreshTokenHash }) {
  const query = `
    UPDATE user_sessions
    SET revoked_at = NOW()
    WHERE id = $1
      AND user_id = $2
      AND refresh_token_hash = $3
      AND revoked_at IS NULL
    RETURNING id
  `;

  const { rows } = await pool.query(query, [
    sessionId,
    userId,
    refreshTokenHash,
  ]);

  return rows[0] || null;
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  replaceActiveSession,
  findActiveSession,
  revokeSession,
};
