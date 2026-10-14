const { Pool } = require("pg");
const env = require("./env");

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

async function testDatabaseConnection() {
  const result = await pool.query("SELECT NOW() AS current_time");

  console.log("PostgreSQL connected successfully");

}

module.exports = {
  pool,
  testDatabaseConnection,
};