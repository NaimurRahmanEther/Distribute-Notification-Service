const { z } = require("zod");
const validate = require("../../../middleware/validate");

// PUT replaces the complete set, so all three booleans are required.
const updateSchema = z.object({
  IN_APP: z.boolean(),
  EMAIL: z.boolean(),
  PUSH: z.boolean(),
}).strict();

module.exports = { validateUpdate: validate(updateSchema) };
