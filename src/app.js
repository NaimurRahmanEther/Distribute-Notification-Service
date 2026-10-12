const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const notFound = require("./middleware/not-found");
const errorHandler = require("./middleware/errorHandler");
const { successResponse } = require("./shared/utils/api-response");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/health", (req, res) => {
  return successResponse(res, {
    message: "Notification service is running",
  });
});

// Register API routes before the not-found and error handlers.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
