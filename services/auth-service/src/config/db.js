const { Pool } = require("pg");
const env = require("./env");
const { log } = require("../shared/utils/logger");

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", () => {
  log("error", "database.connection_failed");
});

async function testDatabaseConnection() {
  await pool.query("SELECT 1");

  log("info", "database.connected");
}

module.exports = {
  pool,
  testDatabaseConnection,
};
