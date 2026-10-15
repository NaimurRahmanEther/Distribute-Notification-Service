const { z } = require("zod");
const AppError = require("../../../shared/errors/AppError");

const createSchema = z.object({
  notificationId: z.string().uuid(),
  channel: z.enum(["IN_APP", "EMAIL", "PUSH"]),
  stage: z.enum(["INITIAL", "UNREAD_REMINDER_1", "UNREAD_REMINDER_2"])
    .default("INITIAL"),
  nextAttemptAt: z.string().datetime({ offset: true }).nullable().default(null),
}).strict();

const idSchema = z.object({ id: z.string().uuid() }).strict();
const listSchema = z.object({ notificationId: z.string().uuid() }).strict();

function validate(schema, source) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError("Validation failed", 400, result.error.flatten().fieldErrors));
    }
    req.validated = req.validated || {};
    req.validated[source] = result.data;
    next();
  };
}

module.exports = {
  createSchema,
  validateId: validate(idSchema, "params"),
  validateList: validate(listSchema, "query"),
};
