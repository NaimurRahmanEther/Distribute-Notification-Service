const { z } = require("zod");
const { DelayedError, UnrecoverableError } = require("bullmq");
const service = require("../modules/notification/schedules/notification-schedule.service");

const scheduleJobSchema = z.object({ version: z.literal(1), scheduleId: z.string().uuid() }).strict();

async function processScheduleJob(job, token) {
  const parsed = scheduleJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError("INVALID_SCHEDULE_JOB");
  }
  const result = await service.processSchedule(parsed.data.scheduleId);
  if (result.delayUntil) {
    await job.moveToDelayed(result.delayUntil, token);
    throw new DelayedError();
  }
  return { status: "PROCESSED" };
}

module.exports = { processScheduleJob };
