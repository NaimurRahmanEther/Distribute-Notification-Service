const { z } = require("zod");
const validate = require("../../../middleware/validate");

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
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  requestId: z.string().uuid().optional(),
}).strict();

// List notifications
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  unreadOnly: z.enum(["true", "false"])
    .default("false")
    .transform(value => value === "true"),

  type: notificationType.optional(),
}).strict();

// Notification ID
const idSchema = z.object({
  id: z.string().uuid(),
}).strict();

module.exports = {
  createSchema,
  validateCreate: validate(createSchema),
  validateList: validate(listSchema, "query"),
  validateId: validate(idSchema, "params"),
};
