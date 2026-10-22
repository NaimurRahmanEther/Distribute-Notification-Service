const { timingSafeEqual } = require("node:crypto");
const env = require("../config/env");
const AppError = require("../shared/errors/AppError");

function authenticateService(req, res, next) {
  const supplied = Buffer.from(req.get("X-Service-Token") || "");
  const expected = Buffer.from(env.INTERNAL_SERVICE_TOKEN);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return next(new AppError("Service authentication required", 401));
  }
  next();
}

module.exports = authenticateService;
