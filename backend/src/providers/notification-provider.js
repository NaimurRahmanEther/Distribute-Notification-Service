const { UnrecoverableError } = require("bullmq");
const inApp = require("./in-app/notification-in-app.provider");
const email = require("./email/notification-email.provider");
const push = require("./push/notification-push.provider");

// Each strategy implements send(notification, delivery, options).
const strategies = new Map([
  ["IN_APP", inApp],
  ["EMAIL", email],
  ["PUSH", push],
]);

async function send(notification, delivery, options) {
  options.signal.throwIfAborted();
  const strategy = strategies.get(delivery.channel);
  if (!strategy) {
    throw new UnrecoverableError("PROVIDER_NOT_IMPLEMENTED");
  }
  return strategy.send(notification, delivery, options);
}

module.exports = { send };
