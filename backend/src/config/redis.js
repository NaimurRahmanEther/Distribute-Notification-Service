const Redis = require("ioredis");
const env = require("./env");

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  connectTimeout: 2000,
  commandTimeout: 2000,
  maxRetriesPerRequest: 1,
});

redis.on("error", (error) => {
  console.error("Redis error:", error.message);
});

module.exports = redis;
