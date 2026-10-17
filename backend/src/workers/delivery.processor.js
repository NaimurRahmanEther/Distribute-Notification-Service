const { DelayedError, UnrecoverableError } = require("bullmq");
const { pool } = require("../config/db");
const config = require("../config/queue");
const { jobSchema } = require("../queue/notification-job");
const repository = require("./delivery.repository");
const preferences = require("../modules/notification/preferences/notification-preference.service");
const provider = require("../providers/notification-provider");

async function sendWithTimeout(send, record) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("PROVIDER_TIMEOUT"));
    }, config.providerTimeoutMs);
  });
  try {
    const sending = send(record, record, {
      signal: controller.signal,
      idempotencyKey: record.id,
    });
    return await Promise.race([sending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function releaseDelivery(client, deliveryId, locked) {
  let connectionError;
  try {
    if (locked) {
      await repository.unlock(deliveryId, client);
    }
  } catch (error) {
    connectionError = error;
  } finally {
    client.release(connectionError);
  }
}

async function sendDelivery(job, record, maxAttempts, send, client) {
  const attempt = await repository.start(record.id, client);
  if (!attempt) {
    return { status: "CANCELLED" };
  }

  let result;
  try {
    result = await sendWithTimeout(send, record);
  } catch (error) {
    const permanent = error instanceof UnrecoverableError;
    const exhausted = attempt.attempt_count >= maxAttempts || job.attemptsMade + 1 >= maxAttempts;
    const failed = permanent || exhausted;
    const status = failed ? "FAILED" : "RETRYING";
    const reason = permanent ? "PERMANENT_PROVIDER_FAILURE" : "TRANSIENT_PROVIDER_FAILURE";
    const delay = config.backoffMs * 2 ** (attempt.attempt_count - 1);

    await repository.finish(record.id, status, reason, delay, null, client);
    if (failed) {
      throw new UnrecoverableError(reason);
    }
    throw new Error(reason);
  }

  await repository.finish(record.id, "SENT", null, 0, result?.providerMessageId || null, client);
  return { status: "SENT" };
}

function createProcessor(send = provider.send) {
  return async (job, token) => {
    const parsed = jobSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError("INVALID_JOB");
    }
    const data = parsed.data;
    const client = await pool.connect();
    let locked = false;
    try {
      locked = await repository.lock(data.deliveryId, client);
      if (!locked) {
        await job.moveToDelayed(Date.now() + 1000, token);
        throw new DelayedError();
      }

      const record = await repository.load(data.deliveryId, client);
      if (!record) {
        return { status: "CANCELLED" };
      }
      // Use the database record for the recipient, channel and stage.
      if (["SENT", "SKIPPED", "CANCELLED", "FAILED"].includes(record.status)) {
        return { status: record.status };
      }

      const settings = await preferences.getMine(record.user_id, client);
      if (!settings[record.channel] || (record.stage !== "INITIAL" && record.read_at)) {
        await repository.finish(record.id, "SKIPPED", null, 0, null, client);
        return { status: "SKIPPED" };
      }
      const maxAttempts = Math.min(job.opts.attempts || config.attempts, config.attempts);
      if (record.attempt_count >= maxAttempts) {
        await repository.finish(record.id, "FAILED", "ATTEMPTS_EXHAUSTED", 0, null, client);
        throw new UnrecoverableError("ATTEMPTS_EXHAUSTED");
      }
      if (record.next_attempt_at && new Date(record.next_attempt_at).getTime() > Date.now()) {
        await job.moveToDelayed(new Date(record.next_attempt_at).getTime(), token);
        throw new DelayedError();
      }

      return await sendDelivery(job, record, maxAttempts, send, client);
    } finally {
      await releaseDelivery(client, data.deliveryId, locked);
    }
  };
}

async function reconcileFailures(queue, afterId = null) {
  const records = await repository.pendingPublished(afterId);
  for (const { id } of records) {
    const job = await queue.getJob(id);
    if (!job || await job.getState() !== "failed") {
      continue;
    }
    const client = await pool.connect();
    let locked = false;
    try {
      locked = await repository.lock(id, client);
      if (!locked) {
        continue;
      }
      const record = await repository.load(id, client);
      if (record && ["PENDING", "RETRYING", "PROCESSING"].includes(record.status)) {
        await repository.finish(id, "FAILED", "QUEUE_JOB_FAILED", 0, null, client);
      }
    } finally {
      await releaseDelivery(client, id, locked);
    }
  }
  return records.length === 100 ? records[records.length - 1].id : null;
}

module.exports = { createProcessor, reconcileFailures };
