const { createShutdown, closeResources } = require("../shared/utils/shutdown");
const { log } = require("../shared/utils/logger");
const { pool } = require("../config/db");
const config = require("../config/queue");
const { createNotificationQueue } = require("../queue/notification.queue");
const { dispatchNext } = require("./outbox-dispatcher");

async function main() {
  const queue = createNotificationQueue();
  const shutdown = createShutdown("outbox");
  log("info", "process.started", { process: "outbox" });
  try {
    while (!shutdown.stopping) {
      try {
        for (let i = 0; i < 25 && !shutdown.stopping; i++) {
          const handled = await dispatchNext(queue);
          if (!handled) {
            break;
          }
        }
      } catch {
        log("error", "outbox.cycle_failed");
      }
      if (!shutdown.stopping) {
        await shutdown.wait(config.pollMs);
      }
    }
  } finally {
    shutdown.stop();
    await closeResources([() => queue.close(), () => pool.end()]);
    shutdown.finish();
  }
}

main().catch(() => {
  log("error", "process.failed", { process: "outbox" });
  process.exitCode = 1;
});
