const { pool } = require("../config/db");
const config = require("../config/queue");
const repository = require("../modules/notification/dead-letters/dead-letter.repository");
const { publishDeadLetter } = require("../queue/dead-letter.queue");

async function dispatchDeadLetter(queue) {
  const client = await pool.connect();
  let connectionError;
  try {
    await client.query("BEGIN");
    const failure = await repository.claimNext(client);
    if (!failure) {
      await client.query("COMMIT");
      return false;
    }
    let published = false;
    try {
      await publishDeadLetter(queue, failure);
      published = true;
    } catch {
      // Durable intent stays in PostgreSQL until publication succeeds.
    }
    if (published) {
      await repository.markPublished(failure.id, client);
    } else {
      const delay = Math.min(60000, config.backoffMs * 2 ** Math.min(failure.publication_attempts, 16));
      await repository.retryPublication(failure.id, delay, client);
    }
    await client.query("COMMIT");
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

module.exports = { dispatchDeadLetter };
