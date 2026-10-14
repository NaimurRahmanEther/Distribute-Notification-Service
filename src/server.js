const app = require("./app");
const env = require("./config/env");
const { testDatabaseConnection } = require("./config/db");

async function startServer() {
  try {
    await testDatabaseConnection();

    app.listen(env.PORT, () => {
      console.log(
        `Notification Service running on port ${env.PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exitCode = 1;
  }
}

startServer();
