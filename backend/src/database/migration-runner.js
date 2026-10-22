const fs = require("node:fs/promises");
const path = require("node:path");
const { pool } = require("../config/db");
const { log } = require("../shared/utils/logger");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);

  return files
    .filter((file) => /^\d+_.+\.up\.sql$/.test(file))
    .sort((a, b) => a.localeCompare(b));
}

async function migrateUp() {
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query("SELECT pg_advisory_lock(742019008)");
    locked = true;
    await ensureMigrationTable(client);

    const files = await getMigrationFiles();

    for (const file of files) {
      const name = file.replace(/\.up\.sql$/, "");

      const existing = await client.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [name]
      );

      if (existing.rowCount > 0) {
        continue;
      }

      const sql = await fs.readFile(
        path.join(MIGRATIONS_DIR, file),
        "utf8"
      );

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [name]
        );

        await client.query("COMMIT");
        log("info", "migration.applied", { migration: name });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    log("info", "migration.completed");
  } finally {
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock(742019008)");
      }
      client.release();
    } catch (error) {
      client.release(error);
      throw error;
    }
  }
}

async function migrateDown() {
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query("SELECT pg_advisory_lock(742019008)");
    locked = true;
    await ensureMigrationTable(client);

    const result = await client.query(`
      SELECT name
      FROM schema_migrations
      ORDER BY name DESC
      LIMIT 1
    `);

    if (result.rowCount === 0) {
      log("info", "migration.no_rollback");
      return;
    }

    const { name } = result.rows[0];
    const file = `${name}.down.sql`;

    const sql = await fs.readFile(
      path.join(MIGRATIONS_DIR, file),
      "utf8"
    );

    await client.query("BEGIN");

    try {
      await client.query(sql);

      await client.query(
        "DELETE FROM schema_migrations WHERE name = $1",
        [name]
      );

      await client.query("COMMIT");
      log("info", "migration.rolled_back", { migration: name });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock(742019008)");
      }
      client.release();
    } catch (error) {
      client.release(error);
      throw error;
    }
  }
}

module.exports = { migrateUp, migrateDown };
