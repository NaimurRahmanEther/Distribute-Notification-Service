function successResponse(res, {
  statusCode = 200,
  message = "Success",
  data = null,
  meta,
}) {
  const response = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
}

function errorResponse(res, {
  statusCode = 500,
  message = "Internal server error",
  errors,
}) {
  const response = {
    success: false,
    message,
  };

  if (errors !== undefined) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  successResponse,
  errorResponse,
};
