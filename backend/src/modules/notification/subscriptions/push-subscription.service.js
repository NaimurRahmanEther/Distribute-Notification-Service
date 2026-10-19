const { randomUUID } = require("node:crypto");
const { pool } = require("../../../config/db");
const env = require("../../../config/env");
const { isConfigured } = require("../../../config/push");
const AppError = require("../../../shared/errors/AppError");
const repository = require("./push-subscription.repository");

function getPublicKey() {
  if (!isConfigured()) {
    throw new AppError("Push is not configured", 503);
  }
  return env.VAPID_PUBLIC_KEY;
}

async function register(userId, input) {
  if (input.expirationTime != null && input.expirationTime <= Date.now()) {
    throw new AppError("Push subscription has expired", 400);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await repository.lockUser(userId, client);
    const existing = await repository.findByEndpoint(input.endpoint, client);
    if (existing) {
      if (existing.user_id !== userId || existing.p256dh !== input.keys.p256dh || existing.auth !== input.keys.auth) {
        throw new AppError("Subscription already registered; unsubscribe before registering again", 409);
      }
      await client.query("COMMIT");
      return { id: existing.id, created_at: existing.created_at };
    }
    const subscriptions = await repository.listForUser(userId, client);
    if (subscriptions.length >= 20) {
      throw new AppError("Remove an old device before adding another", 409);
    }
    const subscription = await repository.create(randomUUID(), userId, input, client);
    await client.query("COMMIT");
    return subscription;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new AppError("Subscription already registered", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function listMine(userId) {
  return repository.listForUser(userId);
}

async function removeMine(userId, id) {
  if (!await repository.removeForUser(userId, id)) {
    throw new AppError("Subscription not found", 404);
  }
}

module.exports = { getPublicKey, register, listMine, removeMine };
