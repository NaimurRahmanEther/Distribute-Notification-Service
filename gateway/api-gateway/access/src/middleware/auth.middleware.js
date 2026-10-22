const { createHmac, createHash } = require("node:crypto");
const auth = require("../clients/auth.client");
const env = require("../config/env");

function signIdentity(req, user, token) {
  const identity = {
    user,
    method: req.get("X-Original-Method"),
    uriHash: createHash("sha256").update(req.get("X-Original-URI")).digest("hex"),
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: Date.now() + 10000,
  };
  const payload = Buffer.from(JSON.stringify(identity)).toString("base64url");
  const signature = createHmac("sha256", env.GATEWAY_IDENTITY_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function authenticate(req, res, next) {
  if (req.routePolicy.public) {
    return next();
  }
  const authorization = req.get("Authorization");
  const match = authorization?.match(/^Bearer +([^\s]+)$/i);
  // Browser WebSocket APIs cannot attach Authorization headers. Only socket
  // routes accept the HttpOnly cookie; ordinary API routes require Bearer auth.
  const token = authorization ? match?.[1] : (req.routePolicy.socket ? req.cookies[env.SOCKET_COOKIE_NAME] : null);
  if (typeof token !== "string" || !token || token.length > 8192) {
    return res.set("X-Gateway-Status", "401").status(403).end();
  }
  try {
    const user = await auth.introspect(token, req.get("X-Request-Id"));
    if (!user) {
      return res.set("X-Gateway-Status", "401").status(403).end();
    }
    if (req.routePolicy.admin && user.role !== "admin") {
      return res.set("X-Gateway-Status", "403").status(403).end();
    }
    res.set("X-Gateway-Identity", signIdentity(req, user, token));
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authenticate;
