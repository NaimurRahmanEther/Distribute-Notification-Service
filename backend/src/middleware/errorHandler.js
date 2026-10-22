const { errorResponse } = require("../shared/utils/api-response");
const { log } = require("../shared/utils/logger");

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    log("error", "http.failed", { requestId: req.requestId, status: statusCode });
  }

  const message = statusCode >= 500 ? "Internal server error" : err.message;
  const errors = statusCode < 500 ? err.errors : undefined;

  return errorResponse(res, {
    statusCode,
    message,
    errors,
  });
}

module.exports = errorHandler;
