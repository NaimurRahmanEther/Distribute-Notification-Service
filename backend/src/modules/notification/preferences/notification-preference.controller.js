const service = require("./notification-preference.service");
const asyncHandler = require("../../../shared/utils/async-handler");
const { successResponse } = require("../../../shared/utils/api-response");

const get = asyncHandler(async (req, res) => {
  const preferences = await service.getMine(req.user.userId);
  return successResponse(res, { data: { preferences } });
});

const update = asyncHandler(async (req, res) => {
  const preferences = await service.updateMine(req.user.userId, req.validated.body);
  return successResponse(res, {
    message: "Notification preferences updated",
    data: { preferences },
  });
});

module.exports = { get, update };
