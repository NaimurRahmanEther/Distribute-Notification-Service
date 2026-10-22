const service = require("./operations.service");
const asyncHandler = require("../../shared/utils/async-handler");
const { successResponse } = require("../../shared/utils/api-response");

const readiness = asyncHandler(async (req, res) => {
  const ready = await service.ready();
  res.setHeader("Cache-Control", "no-store");
  return res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
});

const metrics = asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return successResponse(res, { data: await service.metrics() });
});

module.exports = { readiness, metrics };
