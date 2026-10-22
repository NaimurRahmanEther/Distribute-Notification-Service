const asyncHandler = require("../shared/utils/async-handler");
const authService = require("../modules/auth/auth.service");
const AppError = require("../shared/errors/AppError");

async function authenticate(req, res, next) {
  const authorization = req.get("Authorization");
  const match = authorization?.match(/^Bearer +([^\s]+)$/i);

  if (!match) {
    throw new AppError("A Bearer access token is required", 401);
  }

  req.user = await authService.authenticateAccessToken(match[1]);

  return next();
}

module.exports = asyncHandler(authenticate);
