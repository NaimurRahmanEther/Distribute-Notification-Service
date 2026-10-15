const { randomUUID } = require("node:crypto");
const repository = require("./notification-delivery.repository");
const notifications = require("../notifications/notification.repository");
const AppError = require("../../../shared/errors/AppError");
const { createSchema } = require("./notification-delivery.validation");

// Internal only: caller authorizes the recipient and supplies the transaction
// client shared by notification, delivery, and outbox inserts.
async function create(input, client) {
  const result = createSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("Validation failed", 400, result.error.flatten().fieldErrors);
  }
  if (!client) throw new Error("Delivery creation requires a transaction client");
  return repository.create({ id: randomUUID(), ...result.data }, client);
}

async function getMine(userId, id) {
  const delivery = await repository.findForUser(userId, id);
  if (!delivery) throw new AppError("Delivery not found", 404);
  return delivery;
}

async function listMine(userId, notificationId) {
  const notification = await notifications.findForUser(userId, notificationId);
  if (!notification) throw new AppError("Notification not found", 404);
  return repository.listForUser(userId, notificationId);
}

module.exports = { create, getMine, listMine };
