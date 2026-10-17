require("dotenv").config();

function positiveInteger(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 8000),
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  DELIVERY_MAX_ATTEMPTS: positiveInteger("DELIVERY_MAX_ATTEMPTS", 5, 20),
  DELIVERY_BACKOFF_MS: positiveInteger("DELIVERY_BACKOFF_MS", 1000, 60000),
  WORKER_CONCURRENCY: positiveInteger("WORKER_CONCURRENCY", 3, 5),
  DELIVERY_TIMEOUT_MS: positiveInteger("DELIVERY_TIMEOUT_MS", 10000, 60000),
  OUTBOX_POLL_MS: positiveInteger("OUTBOX_POLL_MS", 1000, 60000),
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || "refreshToken",
  REFRESH_COOKIE_SECURE: (process.env.REFRESH_COOKIE_SECURE || "true") === "true",
  REFRESH_COOKIE_SAME_SITE: process.env.REFRESH_COOKIE_SAME_SITE || "strict",
  REFRESH_COOKIE_PATH: process.env.REFRESH_COOKIE_PATH || "/api/v1/auth",
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

module.exports = env;
