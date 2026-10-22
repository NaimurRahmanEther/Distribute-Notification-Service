const { z } = require("zod");
const validate = require("../../../middleware/validate");

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const idSchema = z.object({ id: z.string().uuid() }).strict();
const replaySchema = z.object({}).strict();

module.exports = {
  validateList: validate(listSchema, "query"),
  validateId: validate(idSchema, "params"),
  validateReplay: validate(replaySchema),
};
