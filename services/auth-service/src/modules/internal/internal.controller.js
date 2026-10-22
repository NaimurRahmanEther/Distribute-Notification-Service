const asyncHandler = require("../../shared/utils/async-handler");
const service = require("./internal.service");

const introspect = asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ user: await service.introspect(req.validated.body.token) });
});
const getUser = asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ user: await service.findUser(req.validated.params.id) });
});

module.exports = { introspect, getUser };
