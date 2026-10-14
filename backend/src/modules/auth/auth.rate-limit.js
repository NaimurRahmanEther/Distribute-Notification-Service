const createRateLimiter = require("../../middleware/rate-limit.middleware");

const registerLimiter = createRateLimiter({
  prefix: "notification-service:rate:register:",
  limit: 5,
  windowMs: 15 * 60 * 1000,
});

const loginLimiter = createRateLimiter({
  prefix: "notification-service:rate:login:",
  limit: 10,
  windowMs: 15 * 60 * 1000,
});

const refreshLimiter = createRateLimiter({
  prefix: "notification-service:rate:refresh:",
  limit: 30,
  windowMs: 60 * 1000,
});

const logoutLimiter = createRateLimiter({
  prefix: "notification-service:rate:logout:",
  limit: 30,
  windowMs: 60 * 1000,
  passOnStoreError: true,
});

module.exports = {
  registerLimiter,
  loginLimiter,
  refreshLimiter,
  logoutLimiter,
};
