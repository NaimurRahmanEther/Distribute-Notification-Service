function asyncHandler(handler) {
  return async function handleRequest(req, res, next) {
    try {
      return await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = asyncHandler;
