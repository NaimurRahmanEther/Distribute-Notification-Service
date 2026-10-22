const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const env = require("./config/env");
const notificationRoutes = require("./modules/notification/notifications/notification.routes");
const deliveryRoutes = require("./modules/notification/deliveries/notification-delivery.routes");
const preferenceRoutes = require("./modules/notification/preferences/notification-preference.routes");
const subscriptionRoutes = require("./modules/notification/subscriptions/push-subscription.routes");
const deadLetterRoutes = require("./modules/notification/dead-letters/dead-letter.routes");
const notFound = require("./middleware/not-found");
const errorHandler = require("./middleware/errorHandler");
const { successResponse } = require("./shared/utils/api-response");
const requestLog = require("./middleware/request-log");
const operations = require("./modules/operations/operations.controller");
const operationsRoutes = require("./modules/operations/operations.routes");

const app = express();
app.set("trust proxy", 2);

app.use(helmet());
app.use(requestLog);
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

app.get("/health", (req, res) => {
  return successResponse(res, {
    message: "Notification service is running",
  });
});
app.get("/health/live", (req, res) => res.json({ status: "alive" }));
app.get("/health/ready", operations.readiness);
app.use("/api/v1/admin/operations", operationsRoutes);

// Register API routes before the not-found and error handlers.
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/notification-deliveries", deliveryRoutes);
app.use("/api/v1/notification-preferences", preferenceRoutes);
app.use("/api/v1/push-subscriptions", subscriptionRoutes);
app.use("/api/v1/admin/dead-letters", deadLetterRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
