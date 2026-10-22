const { randomUUID } = require("node:crypto");
const { context } = require("../shared/utils/logger");

function requestContext(req, res, next) {
  const forwarded = req.get("X-Request-Id");
  const validId = /^[a-f0-9]{32}$|^[a-f0-9-]{36}$/i.test(forwarded || "");
  const requestId = validId ? forwarded : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  context.run({ requestId }, next);
}

module.exports = requestContext;
