const AppError = require("../shared/errors/AppError");

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return next(new AppError("Admin access required", 403));
  }
  next();
}

module.exports = requireAdmin;
