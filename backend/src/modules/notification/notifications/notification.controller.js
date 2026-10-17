const service = require("./notification.service");
const asyncHandler = require("../../../shared/utils/async-handler");
const { successResponse } = require("../../../shared/utils/api-response");

const create = asyncHandler(async (req, res) => {
  const notification = await service.createForSelf(
    req.user.userId, req.validated.body
  );
  return successResponse(res, {
    statusCode: 201,
    message: "Notification created",
    data: { notification },
  });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listMine(req.user.userId, req.validated.query);
  return successResponse(res, {
    data: { notifications: result.notifications },
    meta: result.meta,
  });
});

const get = asyncHandler(async (req, res) => {
  const notification = await service.getMine(req.user.userId, req.validated.params.id);
  return successResponse(res, { data: { notification } });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await service.markMineRead(req.user.userId, req.validated.params.id);
  return successResponse(res, {
    message: "Notification marked as read",
    data: { notification },
  });
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await service.markAllMineRead(req.user.userId);
  return successResponse(res, {
    message: "Notifications marked as read",
    data: result,
  });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteMine(req.user.userId, req.validated.params.id);
  return successResponse(res, { message: "Notification deleted" });
});

module.exports = { create, list, get, markRead, markAllRead, remove };
