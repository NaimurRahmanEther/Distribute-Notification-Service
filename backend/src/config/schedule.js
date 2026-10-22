const env = require("./env");

if (env.REMINDER_MAX_COUNT === 2 && env.REMINDER_SECOND_MS <= env.REMINDER_FIRST_MS) {
  throw new Error("REMINDER_SECOND_MS must be greater than REMINDER_FIRST_MS");
}
if (env.REMINDER_TYPES.some(type => !["SYSTEM", "SECURITY", "ACTIVITY", "ANNOUNCEMENT"].includes(type))) {
  throw new Error("REMINDER_TYPES contains an unsupported notification type");
}

module.exports = {
  queueName: "notification-schedule",
  enabled: env.REMINDERS_ENABLED,
  types: env.REMINDER_TYPES,
  firstMs: env.REMINDER_FIRST_MS,
  secondMs: env.REMINDER_SECOND_MS,
  maxCount: env.REMINDER_MAX_COUNT,
  recheckMs: env.SCHEDULE_RECHECK_MS,
};
