const { z } = require("zod");
const AppError = require("../../shared/errors/AppError");

// Notification types
const notificationType = z.enum([
  "SYSTEM",
  "SECURITY",
  "ACTIVITY",
  "ANNOUNCEMENT",
]);

// Create notification
const createSchema = z.object({
  type: notificationType,
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  data: z.any().optional(),
}).strict();

// List notifications
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  unreadOnly: z.enum(["true", "false"])
    .default("false")
    .transform(v => v === "true"),

  type: notificationType.optional(),
}).strict();

// Notification ID
const idSchema = z.object({
  id: z.string().uuid(),
}).strict();

// Common validation middleware
const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    return next(new AppError(
      "Validation failed",
      400,
      result.error.flatten().fieldErrors
    ));
  }

  req.validated ??= {};
  req.validated[source] = result.data;

  next();
};

module.exports = {
  validateCreate: validate(createSchema),
  validateList: validate(listSchema, "query"),
  validateId: validate(idSchema, "params"),
};