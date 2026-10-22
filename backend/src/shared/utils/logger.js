const { AsyncLocalStorage } = require("node:async_hooks");

const context = new AsyncLocalStorage();
const fields = ["requestId", "notificationId", "deliveryId", "jobId", "scheduleId", "eventId", "status", "method", "route", "durationMs", "process", "reason", "migration"];

function log(level, event, details = {}) {
  const entry = { time: new Date().toISOString(), level, event, ...context.getStore() };
  // Never serialize request bodies, headers, credentials or provider errors.
  for (const field of fields) {
    const value = details[field];
    if (["string", "number", "boolean"].includes(typeof value)) {
      entry[field] = typeof value === "string" ? value.slice(0, 200) : value;
    }
  }
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
}

module.exports = { log, context };
