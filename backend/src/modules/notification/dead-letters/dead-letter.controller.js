const service = require("./dead-letter.service");
const asyncHandler = require("../../../shared/utils/async-handler");
const { successResponse } = require("../../../shared/utils/api-response");

const list = asyncHandler(async (req, res) => {
  const deadLetters = await service.list(req.validated.query);
  return successResponse(res, { data: { deadLetters } });
});

const get = asyncHandler(async (req, res) => {
  const deadLetter = await service.get(req.validated.params.id);
  return successResponse(res, { data: { deadLetter } });
});

const replay = asyncHandler(async (req, res) => {
  const replay = await service.replay(req.validated.params.id, req.user.userId);
  return successResponse(res, { statusCode: 202, message: "Replay scheduled", data: { replay } });
});

module.exports = { list, get, replay };
