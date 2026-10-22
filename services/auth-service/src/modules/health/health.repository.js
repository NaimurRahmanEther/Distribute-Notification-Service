const { pool } = require("../../config/db");

async function ready() {
  const { rows } = await pool.query({
    text: "SELECT COUNT(*)::int AS applied FROM schema_migrations WHERE name IN ('001_create_users','002_create_user_sessions')",
    query_timeout: 3000,
  });
  return rows[0].applied === 2;
}

module.exports = { ready };
