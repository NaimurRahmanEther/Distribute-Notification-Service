const { pool } = require("../config/db");
const config = require("../config/queue");
const repository = require("../modules/notification/outbox/notification-outbox.repository");
const { jobSchema, deliveryJobId } = require("../queue/notification-job");
const { publishDelivery } = require("../queue/notification.queue");
const { log } = require("../shared/utils/logger");

async function dispatchNext(queue) {
  const client = await pool.connect();
  let connectionError;
  try {
    await client.query("BEGIN");
    const event = await repository.claimNext(client);
    if (!event) {
      await client.query("COMMIT");
      return false;
    }

    const parsed = jobSchema.safeParse(event.payload);
    const valid = parsed.success && event.event_type === "DELIVERY_REQUESTED" &&
      parsed.data.deliveryId === event.delivery_id;
    let status = "INVALID";
    if (!valid) {
      await repository.markPublicationFailed(event.id, 0, true, client);
    } else {
      let published = false;
      try {
        await publishDelivery(queue, parsed.data);
        published = true;
      } catch {
        // Keep the event unpublished so Redis outages never discard intent.
      }
      if (published) {
        await repository.markPublished(event.id, client);
        status = "PUBLISHED";
      } else {
        const attempts = Math.min(event.attempt_count, 16);
        const retryDelay = config.backoffMs * 2 ** attempts;
        const delay = Math.min(60000, retryDelay);
        await repository.markPublicationFailed(event.id, delay, false, client);
        status = "RETRYING";
      }
    }

    await client.query("COMMIT");
    log("info", "outbox.processed", { eventId: event.id, deliveryId: event.delivery_id, notificationId: parsed.data?.notificationId, jobId: parsed.success ? deliveryJobId(parsed.data.deliveryId, parsed.data.replayCount) : undefined, status });
    return true;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      connectionError = rollbackError;
    }
    throw error;
  } finally {
    client.release(connectionError);
  }
}

module.exports = { dispatchNext };
