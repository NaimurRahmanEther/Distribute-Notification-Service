const env = require("./config/env");
const redis = require("./config/redis");

async function main() {
  // RedisStore loads its atomic scripts on initialization; connect first.
  await new Promise((resolve, reject) => {
    redis.once("ready", resolve);
    redis.once("error", reject);
  });
  const app = require("./app");
  const server = app.listen(env.PORT);
  let stopping = false;
  function stop() {
    if (stopping) {
      return;
    }
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => {
      redis.disconnect();
      clearTimeout(deadline);
    });
  }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch(() => {
  redis.disconnect();
  console.error(JSON.stringify({ event: "gateway.access.start_failed" }));
  process.exitCode = 1;
});
