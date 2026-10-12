require("dotenv").config();

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 8000),
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

module.exports = env;
