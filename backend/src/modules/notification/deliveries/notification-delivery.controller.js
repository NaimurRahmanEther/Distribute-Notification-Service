const service = require("./notification-delivery.service");
const asyncHandler = require("../../../shared/utils/async-handler");
const { successResponse } = require("../../../shared/utils/api-response");

const list = asyncHandler(async (req, res) => {
  const deliveries = await service.listMine(
    req.user.userId, req.validated.query.notificationId
  );
  return successResponse(res, { data: { deliveries } });
});

const get = asyncHandler(async (req, res) => {
  const delivery = await service.getMine(req.user.userId, req.validated.params.id);
  return successResponse(res, { data: { delivery } });
});

module.exports = { list, get };
