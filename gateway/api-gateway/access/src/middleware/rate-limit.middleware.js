const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const redis = require("../config/redis");
const env = require("../config/env");

function createRateLimiter({ name = "global", limit = env.RATE_LIMIT_MAX, windowMs = env.RATE_LIMIT_WINDOW_MS } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: false,
    // Nginx supplies the IP sanitized by the public load balancer.
    // Group IPv6 clients by /56 so address rotation cannot bypass the limit.
    keyGenerator: req => ipKeyGenerator(req.clientIp),
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: name === "global" ? "gateway:rate:ip:" : `gateway:rate:route:${name}:`,
    }),
    handler: function rejectLimitedRequest(req, res) {
      // auth_request understands 2xx/401/403; Nginx translates this to public 429.
      res.set("X-Gateway-Status", "429").status(403).end();
    },
  });
}

module.exports = createRateLimiter;
