const service = require("./push-subscription.service");
const asyncHandler = require("../../../shared/utils/async-handler");
const { successResponse } = require("../../../shared/utils/api-response");

const publicKey = asyncHandler(async (req, res) => {
  return successResponse(res, { data: { publicKey: service.getPublicKey() } });
});
const create = asyncHandler(async (req, res) => {
  const subscription = await service.register(req.user.userId, req.validated.body);
  return successResponse(res, { statusCode: 201, data: { subscription } });
});
const list = asyncHandler(async (req, res) => {
  return successResponse(res, { data: { subscriptions: await service.listMine(req.user.userId) } });
});
const remove = asyncHandler(async (req, res) => {
  await service.removeMine(req.user.userId, req.validated.params.id);
  return successResponse(res, { message: "Push subscription removed" });
});

module.exports = { publicKey, create, list, remove };
