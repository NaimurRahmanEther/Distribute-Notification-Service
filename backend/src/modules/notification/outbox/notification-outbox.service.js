const { randomUUID } = require("node:crypto");
const { z } = require("zod");
const repository = require("./notification-outbox.repository");
const AppError = require("../../../shared/errors/AppError");

const deliverySchema = z.object({
  id: z.string().uuid(),
  notification_id: z.string().uuid(),
  channel: z.enum(["IN_APP", "EMAIL", "PUSH"]),
  stage: z.enum(["INITIAL", "UNREAD_REMINDER_1", "UNREAD_REMINDER_2"]),
});

async function requestDelivery(delivery, client) {
  if (!client) throw new Error("Outbox creation requires a transaction client");
  const result = deliverySchema.safeParse(delivery);
  if (!result.success) {
    throw new AppError("Invalid delivery event", 400, result.error.flatten().fieldErrors);
  }
  const record = result.data;
  return repository.create({
    id: randomUUID(),
    deliveryId: record.id,
    payload: {
      version: 1,
      notificationId: record.notification_id,
      deliveryId: record.id,
      channel: record.channel,
      stage: record.stage,
      idempotencyKey: record.id,
    },
  }, client);
}

module.exports = { requestDelivery };
