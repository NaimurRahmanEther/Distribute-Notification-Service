const { pool } = require("../config/db");
const { log } = require("../shared/utils/logger");
const {
  migrateUp,
  migrateDown,
} = require("./migration-runner");

async function main() {
  const command = process.argv[2] || "up";

  try {
    if (command === "up") {
      await migrateUp();
    } else if (command === "down") {
      await migrateDown();
    } else {
      throw new Error(
        `Unknown command: ${command}. Use "up" or "down".`
      );
    }
  } catch (error) {
    log("error", "migration.failed", { reason: error.code });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
