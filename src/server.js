const env = require("./config/env");
const app = require("./app");

const server = app.listen(env.PORT, () => {
  console.log(`Notification service is listening on port ${env.PORT}`);
});

server.on("error", (err) => {
  console.error("Failed to start notification service:", err.message);
  process.exitCode = 1;
});
