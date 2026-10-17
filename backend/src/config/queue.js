const env = require("./env");

module.exports = {
  queueName: "notification-delivery",
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
