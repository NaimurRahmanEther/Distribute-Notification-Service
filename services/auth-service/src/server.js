const { createServer } = require("node:http");
const app = require("./app");
const env = require("./config/env");
const { pool, testDatabaseConnection } = require("./config/db");
const redis = require("./config/redis");
const health = require("./modules/health/health.service");
const { createShutdown, closeResources } = require("./shared/utils/shutdown");
const { log } = require("./shared/utils/logger");

async function main() {
  const server = createServer(app);
  const shutdown = createShutdown("auth");
  let closing;
  function stop() {
    if (closing) {
      return closing;
    }
    shutdown.stop();
    health.startDraining();
    closing = new Promise(resolve => server.close(resolve)).then(async () => {
      redis.disconnect();
      await closeResources([() => pool.end()]);
      shutdown.finish();
    });
    server.closeIdleConnections();
    return closing;
  }
  try {
    await testDatabaseConnection();
    if (shutdown.stopping) {
      await stop();
      return;
    }
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(env.PORT, resolve);
    });
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    log("info", "process.started", { process: "auth" });
  } catch {
    process.exitCode = 1;
    log("error", "process.start_failed", { process: "auth" });
    await stop();
  }
}

main().catch(() => {
  process.exitCode = 1;
  log("error", "process.failed", { process: "auth" });
});
