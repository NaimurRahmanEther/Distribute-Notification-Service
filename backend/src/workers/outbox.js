const { setTimeout: delay } = require("node:timers/promises");
const { pool } = require("../config/db");
const config = require("../config/queue");
const { createNotificationQueue } = require("../queue/notification.queue");
const { dispatchNext } = require("./outbox-dispatcher");

async function main() {
  const queue = createNotificationQueue();
  let stopping = false;
  function stop() {
    if (stopping) {
      return;
    }
    stopping = true;
    setTimeout(() => process.exit(1), 30000).unref();
  }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("Outbox dispatcher started");
  try {
    while (!stopping) {
      try {
        for (let i = 0; i < 25 && !stopping; i++) {
          const handled = await dispatchNext(queue);
          if (!handled) {
            break;
          }
        }
      } catch {
        console.error("Outbox dispatch cycle failed; retrying");
      }
      if (!stopping) {
        await delay(config.pollMs);
      }
    }
  } finally {
    await queue.close();
    await pool.end();
  }
}

main().catch(() => {
  console.error("Outbox dispatcher stopped unexpectedly");
  process.exitCode = 1;
});
