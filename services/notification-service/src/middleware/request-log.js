const { randomUUID } = require("node:crypto");
const { context, log } = require("../shared/utils/logger");

function requestLog(req, res, next) {
  const forwarded = req.get("X-Request-Id");
  const requestId = /^[a-f0-9]{32}$|^[a-f0-9-]{36}$/i.test(forwarded || "") ? forwarded : randomUUID();
  const started = performance.now();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.once("finish", () => {
    log("info", "http.request", {
      requestId,
      method: req.method,
      route: req.route ? `${req.baseUrl || ""}${req.route.path}` : "unmatched",
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    });
  });
  context.run({ requestId }, next);
}

module.exports = requestLog;
