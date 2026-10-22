const asyncHandler = require("../shared/utils/async-handler");
const AppError = require("../shared/errors/AppError");

async function requireAdmin(req, res, next) {
  // Authentication introspects the current role with Auth Service on each request.
  if (req.user.role !== "admin") {
    throw new AppError("Admin access required", 403);
  }
  next();
}

module.exports = asyncHandler(requireAdmin);
