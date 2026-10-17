const { Worker } = require("bullmq");
const { setTimeout: delay } = require("node:timers/promises");
const { pool } = require("../config/db");
const config = require("../config/queue");
const { createNotificationQueue } = require("../queue/notification.queue");
const { createProcessor, reconcileFailures } = require("./delivery.processor");

async function main() {
  const queue = createNotificationQueue();
  const worker = new Worker(config.queueName, createProcessor(), {
    connection: config.workerConnection,
    concurrency: config.concurrency,
    maxStalledCount: 2,
  });
  worker.on("error", () => console.error("Notification worker connection error"));
  worker.on("failed", job => console.error("Delivery job failed", job?.id));
  worker.on("completed", job => console.log("Delivery job processed", job.id));

  let stopping = false;
  let cursor = null;
  function stop() {
    if (stopping) {
      return;
    }
    stopping = true;
    setTimeout(() => process.exit(1), 30000).unref();
  }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("Notification worker started");
  try {
    while (!stopping) {
      try {
        cursor = await reconcileFailures(queue, cursor);
      } catch {
        console.error("Failed-job reconciliation will retry");
      }
      if (!stopping) {
        await delay(config.pollMs);
      }
    }
  } finally {
    await worker.close();
    await queue.close();
    await pool.end();
  }
}

main().catch(() => {
  console.error("Notification worker stopped unexpectedly");
  process.exitCode = 1;
});
