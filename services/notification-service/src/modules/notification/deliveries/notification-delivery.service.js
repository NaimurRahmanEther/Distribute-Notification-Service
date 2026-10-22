const { randomUUID } = require("node:crypto");
const repository = require("./notification-delivery.repository");
const notifications = require("../notifications/notification.repository");
const AppError = require("../../../shared/errors/AppError");

// Internal only: caller authorizes the recipient and supplies the transaction
// client shared by notification, delivery, and outbox inserts.
async function create(input, client) {
  return repository.create({ ...input, id: randomUUID() }, client);
}

async function getMine(userId, id) {
  const delivery = await repository.findForUser(userId, id);
  if (!delivery) {
    throw new AppError("Delivery not found", 404);
  }
  return delivery;
}

async function listMine(userId, notificationId) {
  const notification = await notifications.findForUser(userId, notificationId);
  if (!notification) {
    throw new AppError("Notification not found", 404);
  }
  return repository.listForUser(userId, notificationId);
}

module.exports = { create, getMine, listMine };
