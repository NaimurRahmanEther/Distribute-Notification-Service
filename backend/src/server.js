const app = require("./app");
const env = require("./config/env");
const { createServer } = require("node:http");
const { pool, testDatabaseConnection } = require("./config/db");
const redis = require("./config/redis");
const { closeRealtimeConnection } = require("./config/realtime");
const { createNotificationSocket } = require("./realtime/notification-socket");

async function startServer() {
  const server = createServer(app);
  let realtime;
  let stopping = false;

  async function stop() {
    if (stopping) {
      return;
    }
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 30000);
    deadline.unref();
    try {
      if (realtime) {
        await realtime.close();
      }
    } finally {
      closeRealtimeConnection();
      redis.disconnect();
      await pool.end();
      clearTimeout(deadline);
    }
  }

  try {
    await testDatabaseConnection();
    realtime = await createNotificationSocket(server);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(env.PORT, resolve);
    });
    console.log(`Notification Service running on port ${env.PORT}`);
    process.once("SIGINT", () => stop().catch(() => { process.exitCode = 1; }));
    process.once("SIGTERM", () => stop().catch(() => { process.exitCode = 1; }));
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exitCode = 1;
    await stop();
  }
}

startServer().catch(() => {
  console.error("Server shutdown failed");
  process.exitCode = 1;
});
