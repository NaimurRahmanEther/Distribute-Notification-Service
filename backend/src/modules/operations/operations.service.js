const repository = require("./operations.repository");
const redis = require("../../config/redis");
const { Queue } = require("bullmq");
const config = require("../../config/queue");
const schedule = require("../../config/schedule");
const { log } = require("../../shared/utils/logger");
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
    const [databaseReady, pong] = await Promise.all([repository.ready(), redis.ping()]);
    return databaseReady && pong === "PONG" && !draining;
  } catch {
    return false;
  }
}

async function metrics() {
  if (!queues) {
    queues = [];
    const names = [config.queueName, config.deadLetterQueueName, schedule.queueName];
    for (const name of names) {
      const queue = new Queue(name, { connection: config.producerConnection });
      queue.on("error", () => log("error", "metrics.queue_connection_failed"));
      queues.push(queue);
    }
  }
  const database = await repository.metrics();
  const queueMetrics = {};
  for (const queue of queues) {
    const counts = await queue.getJobCounts("wait", "active", "delayed", "failed", "completed");
    const [oldest] = await queue.getJobs(["wait"], 0, 0, true);
    let oldestWaitingSeconds = 0;
    if (oldest) {
      oldestWaitingSeconds = Math.max(0, (Date.now() - oldest.timestamp) / 1000);
    }
    queueMetrics[queue.name] = {
      ...counts,
      oldestWaitingSeconds,
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
