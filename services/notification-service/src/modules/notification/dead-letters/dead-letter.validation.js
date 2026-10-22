const { z } = require("zod");
const validate = require("../../../middleware/validate");

module.exports = {
  validateList: validate(z.object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }).strict(), "query"),
  validateId: validate(z.object({ id: z.string().uuid() }).strict(), "params"),
  validateReplay: validate(z.object({}).strict()),
};
