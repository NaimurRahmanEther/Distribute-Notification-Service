const app = require("./app");
const env = require("./config/env");
const { createServer } = require("node:http");
const { pool, testDatabaseConnection } = require("./config/db");
const redis = require("./config/redis");
const { closeRealtimeConnection } = require("./config/realtime");
const { createNotificationSocket } = require("./realtime/notification-socket");
const operations = require("./modules/operations/operations.service");
const { createShutdown, closeResources } = require("./shared/utils/shutdown");
const { log } = require("./shared/utils/logger");

async function startServer() {
  const server = createServer(app);
  let realtime;
  let stopping = false;
  const shutdown = createShutdown("api");

  async function stop() {
    if (stopping) {
      return;
    }
    stopping = true;
    shutdown.stop();
    operations.startDraining();
    try {
      // Stop accepting HTTP work before closing shared database/Redis clients.
      const drained = new Promise(resolve => server.close(resolve));
      server.closeIdleConnections();
      if (realtime) {
        await realtime.close();
      }
      await drained;
    } finally {
      closeRealtimeConnection();
      redis.disconnect();
      await closeResources([() => operations.close(), () => pool.end()]);
      shutdown.finish();
    }
  }

  try {
    await testDatabaseConnection();
    realtime = await createNotificationSocket(server);
    if (shutdown.stopping) {
      await stop();
      return;
    }
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(env.PORT, resolve);
    });
    log("info", "process.started", { process: "api" });
    process.once("SIGINT", () => stop().catch(() => { process.exitCode = 1; }));
    process.once("SIGTERM", () => stop().catch(() => { process.exitCode = 1; }));
  } catch (error) {
    log("error", "process.start_failed", { process: "api" });
    process.exitCode = 1;
    await stop();
  }
}

startServer().catch(() => {
  log("error", "process.shutdown_failed", { process: "api" });
  process.exitCode = 1;
});
