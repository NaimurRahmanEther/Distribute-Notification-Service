require("dotenv").config({ quiet: true });
const { readFileSync } = require("node:fs");

function secret(name) {
  return process.env[`${name}_FILE`] ? readFileSync(process.env[`${name}_FILE`], "utf8").trim() : process.env[name];
}

function positiveInteger(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

const env = {
  PORT: positiveInteger("PORT", 3003, 65535),
  REDIS_HOST: process.env.REDIS_HOST || "gateway-redis",
  REDIS_PORT: positiveInteger("REDIS_PORT", 6379, 65535),
  RATE_LIMIT_MAX: positiveInteger("GATEWAY_RATE_LIMIT_MAX", 100, 1000000),
  RATE_LIMIT_WINDOW_MS: positiveInteger("GATEWAY_RATE_LIMIT_WINDOW_MS", 60000, 86400000),
  ROUTE_LIMIT_MAX: positiveInteger("GATEWAY_ROUTE_RATE_LIMIT_MAX", 100, 1000000),
  ROUTE_WINDOW_MS: positiveInteger("GATEWAY_ROUTE_RATE_LIMIT_WINDOW_MS", 60000, 86400000),
  LOGIN_LIMIT_MAX: positiveInteger("GATEWAY_LOGIN_RATE_LIMIT_MAX", 10, 1000000),
  REGISTER_LIMIT_MAX: positiveInteger("GATEWAY_REGISTER_RATE_LIMIT_MAX", 5, 1000000),
  AUTH_WINDOW_MS: positiveInteger("GATEWAY_AUTH_RATE_LIMIT_WINDOW_MS", 900000, 86400000),
  SESSION_LIMIT_MAX: positiveInteger("GATEWAY_SESSION_RATE_LIMIT_MAX", 30, 1000000),
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://auth-service:3001",
  AUTH_SERVICE_TIMEOUT_MS: positiveInteger("AUTH_SERVICE_TIMEOUT_MS", 3000, 10000),
  INTERNAL_SERVICE_TOKEN: secret("INTERNAL_SERVICE_TOKEN") || "",
  GATEWAY_IDENTITY_SECRET: secret("GATEWAY_IDENTITY_SECRET") || "",
  SOCKET_COOKIE_NAME: process.env.GATEWAY_SOCKET_COOKIE_NAME || "notificationSocketAccess",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",").map(origin => origin.trim()).filter(Boolean),
};

for (const name of ["INTERNAL_SERVICE_TOKEN", "GATEWAY_IDENTITY_SECRET"]) {
  if (env[name].length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
}

module.exports = env;
