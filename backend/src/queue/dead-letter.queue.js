const { Queue } = require("bullmq");
const { log } = require("../shared/utils/logger");
const config = require("../config/queue");
const { withPublishTimeout } = require("./notification.queue");
const { deliveryJobId } = require("./notification-job");

function createDeadLetterQueue(channel) {
  const queue = new Queue(config.channels[channel].deadLetterQueueName, {
    connection: config.producerConnection,
    defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
  });
  queue.on("error", () => log("error", "dlq.queue_connection_failed"));
  return queue;
}

function createDeadLetterQueues() {
  return Object.fromEntries(Object.keys(config.channels).map(channel => [channel, createDeadLetterQueue(channel)]));
}

async function publishDeadLetter(queues, record) {
  return withPublishTimeout(queues[record.channel].add("failed-delivery", {
    deadLetterId: record.id,
    deliveryId: record.delivery_id,
    channel: record.channel,
    jobId: deliveryJobId(record.delivery_id, record.replay_count),
    replayCount: record.replay_count,
    reason: record.reason,
    attemptCount: record.attempt_count,
    failedAt: record.failed_at.toISOString(),
  }, { jobId: record.id }));
}

module.exports = { createDeadLetterQueue, createDeadLetterQueues, publishDeadLetter };
