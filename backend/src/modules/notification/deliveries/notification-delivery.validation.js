const { z } = require("zod");
const validate = require("../../../middleware/validate");

const idSchema = z.object({ id: z.string().uuid() }).strict();
const listSchema = z.object({ notificationId: z.string().uuid() }).strict();

module.exports = {
  validateId: validate(idSchema, "params"),
  validateList: validate(listSchema, "query"),
};
