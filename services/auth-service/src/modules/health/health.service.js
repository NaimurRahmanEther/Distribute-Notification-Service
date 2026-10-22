const repository = require("./health.repository");
const redis = require("../../config/redis");
let draining = false;

function startDraining() {
  draining = true;
}

async function ready() {
  try {
    const [database, pong] = await Promise.all([repository.ready(), redis.ping()]);
    return !draining && database && pong === "PONG";
  } catch {
    return false;
  }
}

module.exports = { ready, startDraining };
