const { pool } = require("../../../config/db");
const AppError = require("../../../shared/errors/AppError");
const repository = require("./dead-letter.repository");
const deliveries = require("../../../workers/delivery.repository");
const preferences = require("../preferences/notification-preference.service");
const outbox = require("../outbox/notification-outbox.service");
const auth = require("../../../clients/auth.client");
const recipients = require("../recipients/notification-recipient.repository");
const { deliveryJobId } = require("../../../queue/notification-job");

async function list(filters) {
  return repository.list(filters);
}

async function get(id) {
  const failure = await repository.findById(id);
  if (!failure) {
    throw new AppError("Dead letter not found", 404);
  }
  const targets = await repository.targetsForDelivery(failure.delivery_id);
  return { ...failure, jobId: deliveryJobId(failure.delivery_id, failure.replay_count), targets };
}

async function replay(id, adminId) {
  const admin = await auth.getRecipient(adminId);
  if (admin.role !== "admin") {
    throw new AppError("Admin access required", 403);
  }
  await recipients.sync(admin);
  const client = await pool.connect();
  let inTransaction = false;
  let connectionError;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    let failure = await repository.findById(id, client);
    if (!failure) {
      throw new AppError("Dead letter not found", 404);
    }
    // Transaction-scoped lock uses the same key as the worker's session lock.
    const locked = await deliveries.lockForReplay(failure.delivery_id, client);
    if (!locked) {
      throw new AppError("Delivery is busy; try again later", 409);
    }
    failure = await repository.findById(id, client);
    if (!failure) {
      throw new AppError("Dead letter no longer exists", 404);
    }
    const delivery = await deliveries.load(failure.delivery_id, client);
    if (!delivery) {
      throw new AppError("Delivery no longer exists", 404);
    }
    const partialPush = delivery.channel === "PUSH" && delivery.status === "SENT";
    if (failure.replayed_at || failure.replay_count !== delivery.replay_count ||
        (delivery.status !== "FAILED" && !partialPush)) {
      throw new AppError("This failure cannot be replayed", 409);
    }
    if (delivery.read_at) {
      throw new AppError("Notification is already read", 409);
    }
    const settings = await preferences.getMine(delivery.user_id, client);
    if (!settings[delivery.channel]) {
      throw new AppError("Delivery channel is disabled", 409);
    }
    if (delivery.channel === "PUSH" && delivery.push_initialized) {
      const count = await repository.resetFailedTargets(delivery.id, client);
      if (!count) {
        throw new AppError("No failed push targets with an active subscription", 409);
      }
    }
    const reset = await repository.resetDelivery(delivery.id, client);
    await outbox.requestDelivery(reset, client);
    await repository.markReplayed(id, adminId, client);
    await client.query("COMMIT");
    inTransaction = false;
    return { deliveryId: reset.id, replayCount: reset.replay_count, status: reset.status };
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        connectionError = rollbackError;
      }
    }
    throw error;
  } finally {
    client.release(connectionError);
  }
}

module.exports = { list, get, replay };
