require("dotenv").config({ quiet: true });
const { readFileSync } = require("node:fs");
function secret(name) {
  return process.env[`${name}_FILE`] ? readFileSync(process.env[`${name}_FILE`], "utf8").trim() : process.env[name];
}
const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3001),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",").map(origin => origin.trim()).filter(Boolean),
  DATABASE_URL: secret("DATABASE_URL"),
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT || 16381),
  SHUTDOWN_TIMEOUT_MS: Number(process.env.SHUTDOWN_TIMEOUT_MS || 75000),
  INTERNAL_SERVICE_TOKEN: secret("INTERNAL_SERVICE_TOKEN") || "",
  ACCESS_TOKEN_SECRET: secret("ACCESS_TOKEN_SECRET"),
  REFRESH_TOKEN_SECRET: secret("REFRESH_TOKEN_SECRET"),
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || "refreshToken",
  GATEWAY_SOCKET_COOKIE_NAME: process.env.GATEWAY_SOCKET_COOKIE_NAME || "notificationSocketAccess",
  REFRESH_COOKIE_SECURE: (process.env.REFRESH_COOKIE_SECURE || "true") === "true",
  REFRESH_COOKIE_SAME_SITE: process.env.REFRESH_COOKIE_SAME_SITE || "strict",
  REFRESH_COOKIE_PATH: process.env.REFRESH_COOKIE_PATH || "/api/v1/auth",
};
if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
  throw new Error("PORT must be between 1 and 65535");
}
if (!Number.isInteger(env.SHUTDOWN_TIMEOUT_MS) || env.SHUTDOWN_TIMEOUT_MS < 1 || env.SHUTDOWN_TIMEOUT_MS > 300000) {
  throw new Error("Invalid SHUTDOWN_TIMEOUT_MS");
}
if (env.INTERNAL_SERVICE_TOKEN.length < 32) {
  throw new Error("INTERNAL_SERVICE_TOKEN must contain at least 32 characters");
}
module.exports = env;
