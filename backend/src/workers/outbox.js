const { createShutdown, closeResources } = require("../shared/utils/shutdown");
const { log } = require("../shared/utils/logger");
const { pool } = require("../config/db");
const config = require("../config/queue");
const { createNotificationQueues } = require("../queue/notification.queue");
const { dispatchNext } = require("./outbox-dispatcher");

async function main() {
  const queues = createNotificationQueues();
  const shutdown = createShutdown("outbox");
  log("info", "process.started", { process: "outbox" });
  try {
    while (!shutdown.stopping) {
      try {
        for (let i = 0; i < 25 && !shutdown.stopping; i++) {
          const handled = await dispatchNext(queues);
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
    await closeResources(Object.values(queues).map(queue => () => queue.close()));
    await closeResources([() => pool.end()]);
    shutdown.finish();
  }
}

main().catch(() => {
  log("error", "process.failed", { process: "outbox" });
  process.exitCode = 1;
});
