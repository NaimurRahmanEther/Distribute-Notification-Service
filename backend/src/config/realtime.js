const Redis = require("ioredis");
const env = require("./env");

let connection;

function createRealtimeConnection() {
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    lazyConnect: true,
    connectTimeout: 2000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 1,
  });
  redis.on("error", () => console.error("Realtime Redis connection error"));
  return redis;
}

function getRealtimeConnection() {
  if (!connection) {
    connection = createRealtimeConnection();
  }
  return connection;
}

function closeRealtimeConnection() {
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}

module.exports = { createRealtimeConnection, getRealtimeConnection, closeRealtimeConnection };
