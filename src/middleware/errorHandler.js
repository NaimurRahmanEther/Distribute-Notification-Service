
const { errorResponse } = require("../shared/utils/api-response");

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  

  const statusCode = err.statusCode || 500;


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
