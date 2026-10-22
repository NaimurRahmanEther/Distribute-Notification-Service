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

  return errorResponse(res, {
    statusCode,
    message:
      statusCode >= 500
        ? "Internal server error"
        : err.message,
    errors: statusCode < 500 ? err.errors : undefined,
  });
}

module.exports = errorHandler;
