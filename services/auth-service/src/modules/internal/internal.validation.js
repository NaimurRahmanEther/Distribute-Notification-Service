const { z } = require("zod");
const validate = require("../../middleware/validate");

module.exports = {
  validateToken: validate(z.object({ token: z.string().min(1).max(8192) }).strict()),
  validateUser: validate(z.object({
    id: z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n),
  }).strict(), "params"),
};
