const Redis = require("ioredis");
const env = require("./env");
const { log } = require("../shared/utils/logger");

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  connectTimeout: 2000,
  commandTimeout: 2000,
  maxRetriesPerRequest: 1,
});

redis.on("error", () => {
  log("error", "redis.connection_failed");
});

module.exports = redis;
