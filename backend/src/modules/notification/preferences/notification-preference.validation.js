const { z } = require("zod");
const AppError = require("../../../shared/errors/AppError");

// PUT replaces the complete set, so all three booleans are required.
const updateSchema = z.object({
  IN_APP: z.boolean(),
  EMAIL: z.boolean(),
  PUSH: z.boolean(),
}).strict();

function validateUpdate(req, res, next) {
  const result = updateSchema.safeParse(req.body);
  if (!result.success) {
    return next(new AppError(
      "Validation failed", 400, result.error.flatten().fieldErrors
    ));
  }
  req.validated = req.validated || {};
  req.validated.body = result.data;
  next();
}

module.exports = { validateUpdate };
