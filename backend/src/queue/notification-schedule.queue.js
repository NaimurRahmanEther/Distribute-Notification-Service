const { Queue } = require("bullmq");
const { log } = require("../shared/utils/logger");
const queueConfig = require("../config/queue");
const config = require("../config/schedule");
const { withPublishTimeout } = require("./notification.queue");

function createScheduleQueue() {
  const queue = new Queue(config.queueName, {
    connection: queueConfig.producerConnection,
    defaultJobOptions: {
      attempts: queueConfig.attempts,
      backoff: { type: "exponential", delay: queueConfig.backoffMs },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: false,
    },
  });
  queue.on("error", () => log("error", "schedule.queue_connection_failed"));
  return queue;
}

async function publishSchedule(queue, schedule) {
  return withPublishTimeout(queue.add("activate-notification-schedule", { version: 1, scheduleId: schedule.id }, {
    jobId: schedule.id,
    delay: Math.max(0, new Date(schedule.due_at).getTime() - Date.now()),
  }));
}

module.exports = { createScheduleQueue, publishSchedule };
