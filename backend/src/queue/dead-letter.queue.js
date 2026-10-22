const { Queue } = require("bullmq");
const { log } = require("../shared/utils/logger");
const config = require("../config/queue");
const { withPublishTimeout } = require("./notification.queue");
const { deliveryJobId } = require("./notification-job");

function createDeadLetterQueue() {
  const queue = new Queue(config.deadLetterQueueName, {
    connection: config.producerConnection,
    defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
  });
  queue.on("error", () => log("error", "dlq.queue_connection_failed"));
  return queue;
}

async function publishDeadLetter(queue, record) {
  return withPublishTimeout(queue.add("failed-delivery", {
    deadLetterId: record.id,
    deliveryId: record.delivery_id,
    jobId: deliveryJobId(record.delivery_id, record.replay_count),
    replayCount: record.replay_count,
    reason: record.reason,
    attemptCount: record.attempt_count,
    failedAt: record.failed_at.toISOString(),
  }, { jobId: record.id }));
}

module.exports = { createDeadLetterQueue, publishDeadLetter };
