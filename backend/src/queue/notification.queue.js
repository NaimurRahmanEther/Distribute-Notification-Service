const { Queue } = require("bullmq");
const config = require("../config/queue");
const { jobSchema, jobName } = require("./notification-job");

function createNotificationQueue() {
  const queue = new Queue(config.queueName, {
    connection: config.producerConnection,
    defaultJobOptions: {
      attempts: config.attempts,
      backoff: { type: "exponential", delay: config.backoffMs },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: false,
    },
  });
  queue.on("error", () => console.error("Notification queue connection error"));
  return queue;
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

async function publishDelivery(queue, payload) {
  const data = jobSchema.parse(payload);
  const publishPromise = queue.add(jobName, data, { jobId: data.deliveryId });
  return withPublishTimeout(publishPromise);
}

module.exports = { createNotificationQueue, publishDelivery };
