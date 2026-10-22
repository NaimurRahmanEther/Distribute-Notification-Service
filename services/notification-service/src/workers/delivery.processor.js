const { DelayedError, UnrecoverableError } = require("bullmq");
const { pool } = require("../config/db");
const config = require("../config/queue");
const { jobSchema, deliveryJobId } = require("../queue/notification-job");
const repository = require("./delivery.repository");
const preferences = require("../modules/notification/preferences/notification-preference.service");
const provider = require("../providers/notification-provider");
const routing = require("./delivery-routing.service");
const pushTargets = require("../providers/push/push-target.repository");
const schedules = require("../modules/notification/schedules/notification-schedule.service");
const presence = require("../modules/notification/presence/notification-presence.service");

async function sendWithTimeout(send, record, client) {
  const controller = new AbortController();
  // Push records device outcomes using this client. Wait for abort cleanup before
  // releasing the delivery lock or allowing another attempt to use its targets.
  if (record.channel === "PUSH") {
    const deadline = setTimeout(() => controller.abort(), config.providerTimeoutMs);
    try {
      return await send(record, record, { signal: controller.signal, idempotencyKey: record.id, client });
    } finally {
      clearTimeout(deadline);
    }
  }
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

async function finishPushTargets(record, client) {
  if (record.channel !== "PUSH") {
    return false;
  }
  await pushTargets.failPending(record.id, client);
  const outcomes = await pushTargets.summary(record.id, client);
  if (!outcomes.sent) {
    return false;
  }
  await repository.finish(record.id, "SENT", "SOME_PUSH_TARGETS_FAILED", 0, null, client);
  return true;
}

async function sendDelivery(job, record, maxAttempts, send, client) {
  const attempt = await repository.start(record.id, client);
  if (!attempt) {
    const current = await repository.load(record.id, client);
    if (current && ["PENDING", "RETRYING", "PROCESSING"].includes(current.status)) {
      if (record.channel === "PUSH") {
        await pushTargets.cancelPending(record.id, client);
      }
      await repository.finish(record.id, "CANCELLED", "NOTIFICATION_READ", 0, null, client);
    }
    return { status: "CANCELLED" };
  }

  let result;
  try {
    result = await sendWithTimeout(send, record, client);
  } catch (error) {
    if (error.pushUnavailable && await routing.fallbackFromPush(record, client)) {
      return { status: "SKIPPED" };
    }
    const permanent = error instanceof UnrecoverableError;
    const exhausted = attempt.attempt_count >= maxAttempts || job.attemptsMade + 1 >= maxAttempts;
    const failed = permanent || exhausted;
    const status = failed ? "FAILED" : "RETRYING";
    const reason = permanent ? "PERMANENT_PROVIDER_FAILURE" : "TRANSIENT_PROVIDER_FAILURE";
    const backoff = config.backoffMs * 2 ** (attempt.attempt_count - 1);
    const delay = Math.max(backoff, error.retryAfterMs || 0);

    if (failed && await finishPushTargets(record, client)) {
      return { status: "SENT" };
    }

    await repository.finish(record.id, status, reason, delay, null, client);
    if (failed) {
      throw new UnrecoverableError(reason);
    }
    throw new Error(reason);
  }

  const reason = result?.partialFailure ? "SOME_PUSH_TARGETS_FAILED" : null;
  await repository.finish(record.id, "SENT", reason, 0, result?.providerMessageId || null, client);
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
      if (data.replayCount !== record.replay_count) {
        return { status: "STALE" };
      }
      // Use the database record for the recipient, channel and stage.
      if (["SENT", "SKIPPED", "CANCELLED", "FAILED"].includes(record.status)) {
        return { status: record.status };
      }

      const settings = await preferences.getMine(record.user_id, client);
      const cancelRead = record.stage !== "INITIAL" || record.replay_count > 0 || record.scheduled_at;
      if (!settings[record.channel] || (cancelRead && record.read_at)) {
        if (record.channel === "PUSH") {
          await pushTargets.cancelPending(record.id, client);
        }
        await repository.finish(record.id, "SKIPPED", null, 0, null, client);
        return { status: "SKIPPED" };
      }
      if (record.stage !== "INITIAL") {
        const activity = await presence.getForUser(record.user_id);
        if (!schedules.reminderEnabled(record.type, record.stage) || activity.active) {
          if (record.channel === "PUSH") {
            await pushTargets.cancelPending(record.id, client);
          }
          await repository.finish(record.id, "SKIPPED", "REMINDER_NOT_ELIGIBLE", 0, null, client);
          return { status: "SKIPPED" };
        }
      }
      const maxAttempts = Math.min(job.opts.attempts || config.attempts, config.attempts);
      if (record.attempt_count >= maxAttempts) {
        if (await finishPushTargets(record, client)) {
          return { status: "SENT" };
        }
        await repository.finish(record.id, "FAILED", "ATTEMPTS_EXHAUSTED", 0, null, client);
        throw new UnrecoverableError("ATTEMPTS_EXHAUSTED");
      }
      if (record.next_attempt_at && new Date(record.next_attempt_at).getTime() > Date.now()) {
        await job.moveToDelayed(new Date(record.next_attempt_at).getTime(), token);
        throw new DelayedError();
      }

      if (await routing.redirectIfNeeded(record, settings, client)) {
        return { status: "SKIPPED" };
      }
      return await sendDelivery(job, record, maxAttempts, send, client);
    } finally {
      await releaseDelivery(client, data.deliveryId, locked);
    }
  };
}

async function reconcileFailures(queue, afterId = null) {
  const records = await repository.pendingPublished(afterId);
  for (const { id, replay_count: replayCount } of records) {
    const job = await queue.getJob(deliveryJobId(id, replayCount));
    const state = job ? await job.getState() : "missing";
    if (!["failed", "missing", "completed"].includes(state)) {
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
      if (record && record.replay_count === replayCount && ["PENDING", "RETRYING", "PROCESSING"].includes(record.status)) {
        if (state !== "failed") {
          if (job) {
            await job.remove();
          }
          await repository.republishMissing(id, replayCount, client);
          continue;
        }
        if (await finishPushTargets(record, client)) {
          continue;
        }
        await repository.finish(id, "FAILED", "QUEUE_JOB_FAILED", 0, null, client);
      }
    } finally {
      await releaseDelivery(client, id, locked);
    }
  }
  return records.length === 100 ? records[records.length - 1].id : null;
}

module.exports = { createProcessor, reconcileFailures };
