const asyncHandler = require("../shared/utils/async-handler");
const authService = require("../clients/auth.client");
const AppError = require("../shared/errors/AppError");
const { readGatewayIdentity } = require("../clients/gateway-identity");
const recipients = require("../modules/notification/recipients/notification-recipient.repository");

const authenticate = asyncHandler(async function authenticateRequest(req, res, next) {
  const authorization = req.get("Authorization");
  const match = authorization?.match(/^Bearer +([^\s]+)$/i);

  if (!match) {
    throw new AppError("A Bearer access token is required", 401);
  }

  const user = readGatewayIdentity(req, match[1]);
  if (user) {
    req.user = user;
    await recipients.sync(user);
  } else {
    req.user = await authService.authenticateAccessToken(match[1]);
  }

  return next();
});

module.exports = authenticate;
