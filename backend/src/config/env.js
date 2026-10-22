require("dotenv").config({ quiet: true });
const { readFileSync } = require("node:fs");

function secret(name) {
  const file = process.env[`${name}_FILE`];
  return file ? readFileSync(file, "utf8").trim() : process.env[name];
}

function positiveInteger(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3000),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",").map(origin => origin.trim()).filter(Boolean),
  DATABASE_URL: secret("DATABASE_URL"),
  ACCESS_TOKEN_SECRET: secret("ACCESS_TOKEN_SECRET"),
  REFRESH_TOKEN_SECRET: secret("REFRESH_TOKEN_SECRET"),
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || "refreshToken",
  REFRESH_COOKIE_SECURE: (process.env.REFRESH_COOKIE_SECURE || "true") === "true",
  REFRESH_COOKIE_SAME_SITE: process.env.REFRESH_COOKIE_SAME_SITE || "strict",
  REFRESH_COOKIE_PATH: process.env.REFRESH_COOKIE_PATH || "/api/v1/auth",
  RATE_LIMIT_MAX: positiveInteger("RATE_LIMIT_MAX", 100, 1000000),
  RATE_LIMIT_WINDOW_MS: positiveInteger("RATE_LIMIT_WINDOW_MS", 60000, 86400000),
  SHUTDOWN_TIMEOUT_MS: positiveInteger("SHUTDOWN_TIMEOUT_MS", 75000, 300000),
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  DELIVERY_MAX_ATTEMPTS: positiveInteger("DELIVERY_MAX_ATTEMPTS", 5, 20),
  DELIVERY_BACKOFF_MS: positiveInteger("DELIVERY_BACKOFF_MS", 1000, 60000),
  WORKER_CONCURRENCY: positiveInteger("WORKER_CONCURRENCY", 3, 5),
  DELIVERY_TIMEOUT_MS: positiveInteger("DELIVERY_TIMEOUT_MS", 10000, 60000),
  OUTBOX_POLL_MS: positiveInteger("OUTBOX_POLL_MS", 1000, 60000),
  SOCKET_ORIGINS: (process.env.SOCKET_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
  SOCKET_CHECK_MS: positiveInteger("SOCKET_CHECK_MS", 15000, 60000),
  PRESENCE_TTL_MS: positiveInteger("PRESENCE_TTL_MS", 60000, 300000),
  REALTIME_PREFIX: process.env.REALTIME_PREFIX || "notification-service:realtime",
  RESEND_API_KEY: secret("RESEND_API_KEY") || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "",
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY: secret("VAPID_PRIVATE_KEY") || "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || "",
  REMINDERS_ENABLED: (process.env.REMINDERS_ENABLED || "true") === "true",
  REMINDER_FIRST_MS: positiveInteger("REMINDER_FIRST_MS", 1800000, 2592000000),
  REMINDER_SECOND_MS: positiveInteger("REMINDER_SECOND_MS", 86400000, 2592000000),
  REMINDER_MAX_COUNT: positiveInteger("REMINDER_MAX_COUNT", 2, 2),
  REMINDER_TYPES: (process.env.REMINDER_TYPES || "SYSTEM,SECURITY").split(",").map(value => value.trim()),
  SCHEDULE_RECHECK_MS: positiveInteger("SCHEDULE_RECHECK_MS", 60000, 300000),
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

for (const name of ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]) {
  if (!env[name] || env[name].length < 32) {
    throw new Error(name + " must contain at least 32 characters");
  }
}

module.exports = env;
