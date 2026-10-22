const { pool } = require("../config/db");
const config = require("../config/schedule");
const repository = require("../modules/notification/schedules/notification-schedule.repository");
const { publishSchedule } = require("../queue/notification-schedule.queue");

async function dispatchSchedule(queue) {
  const client = await pool.connect();
  let connectionError;
  try {
    await client.query("BEGIN");
    const schedule = await repository.claimForPublication(client);
    if (!schedule) {
      await client.query("COMMIT");
      return false;
    }
    let error = null;
    try {
      let job = await queue.getJob(schedule.id);
      if (job) {
        const state = await job.getState();
        if (["failed", "completed"].includes(state)) {
          await job.remove();
          job = null;
        }
      }
      if (!job) {
        await publishSchedule(queue, schedule);
      }
    } catch {
      error = "SCHEDULE_PUBLICATION_FAILED";
    }
    await repository.checked(schedule.id, config.recheckMs, error, client);
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

module.exports = { dispatchSchedule };
