const env = require("./env");

function isConfigured() {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

// Subscription endpoints are client input. Never send requests to arbitrary hosts.
function isAllowedEndpoint(value) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    const allowed = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com";
    return allowed && url.protocol === "https:" && !url.username && !url.password &&
      !url.port && !url.hash;
  } catch {
    return false;
  }
}

module.exports = { isConfigured, isAllowedEndpoint };
