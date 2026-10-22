const repository = require("./operations.repository");
const redis = require("../../config/redis");
const { Queue } = require("bullmq");
const config = require("../../config/queue");
const schedule = require("../../config/schedule");
const { log } = require("../../shared/utils/logger");
const auth = require("../../clients/auth.client");
let queues;
let draining = false;

function startDraining() {
  draining = true;
}

async function ready() {
  if (draining) {
    return false;
  }
  try {
    const [databaseReady, pong, authReady] = await Promise.all([repository.ready(), redis.ping(), auth.ready()]);
    return databaseReady && pong === "PONG" && authReady && !draining;
  } catch {
    return false;
  }
}

async function metrics() {
  if (!queues) {
    queues = [config.queueName, config.deadLetterQueueName, schedule.queueName].map(name => {
      const queue = new Queue(name, { connection: config.producerConnection });
      queue.on("error", () => log("error", "metrics.queue_connection_failed"));
      return queue;
    });
  }
  const database = await repository.metrics();
  const queueMetrics = {};
  for (const queue of queues) {
    const counts = await queue.getJobCounts("wait", "active", "delayed", "failed", "completed");
    const [oldest] = await queue.getJobs(["wait"], 0, 0, true);
    queueMetrics[queue.name] = {
      ...counts,
      oldestWaitingSeconds: oldest ? Math.max(0, (Date.now() - oldest.timestamp) / 1000) : 0,
    };
  }
  return { collectedAt: new Date().toISOString(), database, queues: queueMetrics };
}

async function close() {
  if (queues) {
    await Promise.all(queues.map(queue => queue.close()));
  }
}

module.exports = { ready, metrics, startDraining, close };
