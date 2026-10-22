// Offline copy into EMPTY, already-migrated service databases. Source is read-only.
const { createRequire } = require("node:module");
const path = require("node:path");
const serviceRequire = createRequire(path.resolve(__dirname, "../services/notification-service/package.json"));
serviceRequire("dotenv").config({ quiet: true });
const { Client } = serviceRequire("pg");

const authTables = ["users", "user_sessions"];
const notificationTables = ["notifications", "notification_preferences", "notification_deliveries", "notification_outbox", "notification_push_subscriptions", "notification_push_targets", "notification_dead_letters", "notification_schedules"];

function identity(connectionString) {
  const url = new URL(connectionString);
  return `${url.hostname}:${url.port || 5432}${url.pathname}`;
}

async function assertEmpty(client, tables) {
  for (const table of tables) {
    const result = await client.query(`SELECT 1 FROM ${table} LIMIT 1`);
    if (result.rowCount) {
      throw new Error("Targets must be empty. Stop service processes before importing.");
    }
  }
}

async function copyTable(source, target, table, sourceQuery = `SELECT * FROM ${table}`) {
  const columns = (await target.query(
    "SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table]
  )).rows;
  const names = columns.map(column => `"${column.column_name}"`).join(",");
  let offset = 0;
  while (true) {
    // Repeatable-read source and stopped legacy writers give a stable snapshot.
    const { rows } = await source.query(`${sourceQuery} ORDER BY 1,2 OFFSET $1 LIMIT 250`, [offset]);
    if (!rows.length) {
      break;
    }
    const values = [];
    const tuples = rows.map(row => {
      const placeholders = columns.map(column => {
        let value = row[column.column_name];
        if (column.data_type === "jsonb" || column.data_type === "json") {
          value = JSON.stringify(value);
        }
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    const override = table === "users" ? "OVERRIDING SYSTEM VALUE" : "";
    await target.query(`INSERT INTO ${table} (${names}) ${override} VALUES ${tuples.join(",")}`, values);
    offset += rows.length;
  }
  console.log(`${table}: ${offset} rows copied`);
}

async function main() {
  const urls = [process.env.LEGACY_DATABASE_URL, process.env.AUTH_DATABASE_URL, process.env.NOTIFICATION_DATABASE_URL];
  if (urls.some(url => !url) || new Set(urls.map(identity)).size !== 3) {
    throw new Error("Provide three distinct LEGACY_DATABASE_URL, AUTH_DATABASE_URL and NOTIFICATION_DATABASE_URL values.");
  }
  const clients = urls.map(connectionString => new Client({ connectionString }));
  const [source, auth, notification] = clients;
  let committedAuth = false;
  try {
    await Promise.all(clients.map(client => client.connect()));
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const client of [auth, notification]) {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(742019008)");
    }
    await assertEmpty(auth, authTables);
    await assertEmpty(notification, ["notification_recipients", ...notificationTables]);
    for (const table of authTables) {
      await copyTable(source, auth, table);
    }
    await copyTable(source, notification, "notification_recipients", "SELECT id,email,updated_at FROM users");
    for (const table of notificationTables) {
      await copyTable(source, notification, table);
    }
    // Redis is new: republish durable DLQ records without retrying their deliveries.
    await notification.query("UPDATE notification_dead_letters SET published_at=NULL, publication_attempts=0, next_publish_at=NOW()");
    await auth.query("SELECT setval(pg_get_serial_sequence('users','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM users");
    await auth.query("COMMIT");
    committedAuth = true;
    await notification.query("COMMIT");
    await source.query("ROLLBACK");
    console.log("Copy complete. Legacy database was not modified. Keep the legacy stack stopped during cutover.");
  } catch (error) {
    await Promise.allSettled(clients.map(client => client.query("ROLLBACK")));
    if (committedAuth) {
      console.error("Auth target committed before the failure. Restore BOTH empty targets before retrying; do not use a partial copy.");
    }
    throw error;
  } finally {
    await Promise.allSettled(clients.map(client => client.end()));
  }
}

main().catch(() => {
  // Do not print database connection strings, source rows or SQL error details.
  console.error("Legacy copy failed. Check the three connections, empty migrated targets and stopped writers. Source data is unchanged.");
  process.exitCode = 1;
});
