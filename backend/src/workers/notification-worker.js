const { Worker } = require("bullmq");
const { createShutdown, closeResources } = require("../shared/utils/shutdown");
const { log } = require("../shared/utils/logger");
const { pool } = require("../config/db");
const config = require("../config/queue");
const { createNotificationQueue } = require("../queue/notification.queue");
const { createProcessor, reconcileFailures } = require("./delivery.processor");
const { closeRealtimeConnection } = require("../config/realtime");
const { createDeadLetterQueue } = require("../queue/dead-letter.queue");
const { dispatchDeadLetter } = require("./dead-letter-dispatcher");
const scheduleConfig = require("../config/schedule");
const { createScheduleQueue } = require("../queue/notification-schedule.queue");
const { processScheduleJob } = require("./schedule.processor");
const { dispatchSchedule } = require("./schedule-dispatcher");

async function main() {
  const queue = createNotificationQueue();
  const deadLetterQueue = createDeadLetterQueue();
  const scheduleQueue = createScheduleQueue();
  const scheduleWorker = new Worker(scheduleConfig.queueName, processScheduleJob, {
    connection: config.workerConnection,
    concurrency: config.concurrency,
    maxStalledCount: 2,
  });
  scheduleWorker.on("error", () => log("error", "schedule.connection_failed"));
  scheduleWorker.on("failed", job => log("error", "schedule.job_failed", { jobId: job?.id, scheduleId: job?.data?.scheduleId }));
  const worker = new Worker(config.queueName, createProcessor(), {
    connection: config.workerConnection,
    concurrency: config.concurrency,
    maxStalledCount: 2,
  });
  worker.on("error", () => log("error", "delivery.connection_failed"));
  worker.on("failed", job => log("error", "delivery.job_failed", { jobId: job?.id, deliveryId: job?.data?.deliveryId, notificationId: job?.data?.notificationId }));

  const shutdown = createShutdown("worker");
  let cursor = null;
  log("info", "process.started", { process: "worker" });
  try {
    while (!shutdown.stopping) {
      try {
        cursor = await reconcileFailures(queue, cursor);
      } catch {
        log("error", "delivery.reconciliation_failed");
      }
      try {
        for (let count = 0; count < 25 && !shutdown.stopping; count++) {
          if (!await dispatchSchedule(scheduleQueue)) {
            break;
          }
        }
      } catch {
        log("error", "schedule.reconciliation_failed");
      }
      try {
        for (let count = 0; count < 25 && !shutdown.stopping; count++) {
          if (!await dispatchDeadLetter(deadLetterQueue)) {
            break;
          }
        }
      } catch {
        log("error", "dlq.publication_failed");
      }
      if (!shutdown.stopping) {
        await shutdown.wait(config.pollMs);
      }
    }
  } finally {
    shutdown.stop();
    // Stop both consumers together, then release their dependencies.
    await closeResources([() => scheduleWorker.close(), () => worker.close()]);
    await closeResources([() => queue.close(), () => deadLetterQueue.close(), () => scheduleQueue.close()]);
    closeRealtimeConnection();
    await closeResources([() => pool.end()]);
    shutdown.finish();
  }
}

main().catch(() => {
  log("error", "process.failed", { process: "worker" });
  process.exitCode = 1;
});
