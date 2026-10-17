const { randomUUID } = require("node:crypto");
const repository = require("./notification-outbox.repository");

async function requestDelivery(delivery, client) {
  return repository.create({
    id: randomUUID(),
    deliveryId: delivery.id,
    payload: {
      version: 1,
      notificationId: delivery.notification_id,
      deliveryId: delivery.id,
      channel: delivery.channel,
      stage: delivery.stage,
      idempotencyKey: delivery.id,
    },
  }, client);
}

module.exports = { requestDelivery };
