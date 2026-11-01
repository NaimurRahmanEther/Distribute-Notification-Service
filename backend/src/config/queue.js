const env = require("./env");

const channels = Object.fromEntries(["IN_APP", "EMAIL", "PUSH"].map(channel => [channel, {
  queueName: "notification-delivery-" + channel.toLowerCase().replace("_", "-"),
  deadLetterQueueName: "notification-dead-letter-" + channel.toLowerCase().replace("_", "-"),
  concurrency: env[channel + "_WORKER_CONCURRENCY"],
  limiter: { max: env[channel + "_WORKER_RATE_MAX"], duration: env[channel + "_WORKER_RATE_DURATION_MS"] },
}]));

const deliveryConcurrency = Object.values(channels).reduce((total, channel) => total + channel.concurrency, 0);
// Consumers hold one client each. Reserve one for the serial background loop
// and one spare so delivery work cannot consume the entire pool.
const minimumPoolSize = deliveryConcurrency + env.WORKER_CONCURRENCY + 2;
if (env.DB_POOL_MAX < minimumPoolSize) {
  throw new Error(`DB_POOL_MAX must be at least ${minimumPoolSize} for the configured delivery and schedule concurrency plus 2 background connections`);
}

module.exports = {
  channels,
  attempts: env.DELIVERY_MAX_ATTEMPTS,
  backoffMs: env.DELIVERY_BACKOFF_MS,
  concurrency: env.WORKER_CONCURRENCY,
  providerTimeoutMs: env.DELIVERY_TIMEOUT_MS,
  pollMs: env.OUTBOX_POLL_MS,
  publishTimeoutMs: 5000,
  // Separate connections: do not change the auth rate limiter's Redis client.
  producerConnection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    connectTimeout: 2000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  },
  workerConnection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    connectTimeout: 2000,
    maxRetriesPerRequest: null,
  },
};
