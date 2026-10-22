const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const redis = require("../config/redis");
const AppError = require("../shared/errors/AppError");

function createRateLimiter({
  prefix,
  limit,
  windowMs,
  passOnStoreError = false,
}) {
  const limiter = rateLimit({
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

  return function limitRequest(req, res, next) {
    limiter(req, res, error => {
      if (error) {
        return next(new AppError("Rate limiter unavailable", 503));
      }
      next();
    });
  };
}

module.exports = createRateLimiter;
