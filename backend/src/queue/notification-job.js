const { z } = require("zod");

const jobSchema = z.object({
  version: z.literal(1),
  notificationId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  channel: z.enum(["IN_APP", "EMAIL", "PUSH"]),
  stage: z.enum(["INITIAL", "UNREAD_REMINDER_1", "UNREAD_REMINDER_2"]),
  idempotencyKey: z.string().uuid(),
}).strict().refine(value => value.idempotencyKey === value.deliveryId, {
  message: "Idempotency key must match delivery ID",
});

module.exports = { jobSchema, jobName: "deliver-notification" };
