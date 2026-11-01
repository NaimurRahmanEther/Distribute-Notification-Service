const { Queue } = require("bullmq");
const { log } = require("../shared/utils/logger");
const config = require("../config/queue");
const { jobSchema, jobName, deliveryJobId } = require("./notification-job");

function createNotificationQueue(channel) {
  const queue = new Queue(config.channels[channel].queueName, {
    connection: config.producerConnection,
    defaultJobOptions: {
      attempts: config.attempts,
      backoff: { type: "exponential", delay: config.backoffMs },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: false,
    },
  });
  queue.on("error", () => log("error", "delivery.queue_connection_failed"));
  return queue;
}

function createNotificationQueues() {
  return Object.fromEntries(Object.keys(config.channels).map(channel => [channel, createNotificationQueue(channel)]));
}

async function withPublishTimeout(publishPromise) {
  let timer;
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Queue publication timed out"));
    }, config.publishTimeoutMs);
  });

  try {
    return await Promise.race([publishPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

async function publishDelivery(queues, payload) {
  const data = jobSchema.parse(payload);
  const publishPromise = queues[data.channel].add(jobName, data, { jobId: deliveryJobId(data.deliveryId, data.replayCount) });
  return withPublishTimeout(publishPromise);
}

module.exports = { createNotificationQueue, createNotificationQueues, publishDelivery, withPublishTimeout };
