const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const redis = require("../config/redis");

function createRateLimiter({
  prefix,
  limit,
  windowMs,
  passOnStoreError = false,
}) {
  return rateLimit({
    windowMs,
    limit,
    passOnStoreError,
    standardHeaders: true,
    legacyHeaders: false,

    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    }),

    handler: (req, res) => {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
      });
    },
  });
}

module.exports = createRateLimiter;
