const { z } = require("zod");

const jobSchema = z.object({
  version: z.literal(1),
  notificationId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  channel: z.enum(["IN_APP", "EMAIL", "PUSH"]),
  stage: z.enum(["INITIAL", "UNREAD_REMINDER_1", "UNREAD_REMINDER_2"]),
  idempotencyKey: z.string().uuid(),
  replayCount: z.number().int().min(0).max(2147483647).default(0),
}).strict().refine(value => value.idempotencyKey === value.deliveryId, {
  message: "Idempotency key must match delivery ID",
});

function deliveryJobId(deliveryId, replayCount = 0) {
  return replayCount === 0 ? deliveryId : `${deliveryId}-replay-${replayCount}`;
}

module.exports = { jobSchema, jobName: "deliver-notification", deliveryJobId };
