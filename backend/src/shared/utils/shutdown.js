const { setTimeout: delay } = require("node:timers/promises");
const env = require("../../config/env");
const { log } = require("./logger");

function createShutdown(name) {
  const controller = new AbortController();
  let deadline;
  function stop() {
    if (controller.signal.aborted) {
      return;
    }
    log("info", "process.stopping", { process: name });
    controller.abort();
    deadline = setTimeout(() => {
      log("error", "process.shutdown_timeout", { process: name });
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    deadline.unref();
  }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  async function wait(ms) {
    try {
      await delay(ms, undefined, { signal: controller.signal });
    } catch (error) {
      if (error.name !== "AbortError") {
        throw error;
      }
    }
  }

  function finish() {
    clearTimeout(deadline);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    log("info", "process.stopped", { process: name });
  }

  return { get stopping() { return controller.signal.aborted; }, stop, wait, finish };
}

async function closeResources(closers) {
  const results = await Promise.allSettled(closers.map(close => Promise.resolve().then(close)));
  if (results.some(result => result.status === "rejected")) {
    process.exitCode = 1;
    log("error", "process.cleanup_failed");
  }
}

module.exports = { createShutdown, closeResources };
