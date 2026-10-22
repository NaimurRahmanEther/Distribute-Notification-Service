const service = require("./health.service");
const asyncHandler = require("../../shared/utils/async-handler");

const readiness = asyncHandler(async (req, res) => {
  const ready = await service.ready();
  res.setHeader("Cache-Control", "no-store");
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
});

module.exports = { readiness };
