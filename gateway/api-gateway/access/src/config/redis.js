const Redis = require("ioredis");
const env = require("./env");

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  connectTimeout: 1000,
  commandTimeout: 1000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

redis.on("error", () => {
  console.error(JSON.stringify({ event: "gateway.rate_limit.redis_unavailable" }));
});

module.exports = redis;
