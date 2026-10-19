const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const authRoutes = require("./modules/auth/auth.routes");
const notificationRoutes = require("./modules/notification/notifications/notification.routes");
const deliveryRoutes = require("./modules/notification/deliveries/notification-delivery.routes");
const preferenceRoutes = require("./modules/notification/preferences/notification-preference.routes");
const subscriptionRoutes = require("./modules/notification/subscriptions/push-subscription.routes");
const notFound = require("./middleware/not-found");
const errorHandler = require("./middleware/errorHandler");
const { successResponse } = require("./shared/utils/api-response");
const morgan = require("morgan");

const app = express();

app.use(helmet());
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

app.get("/health", (req, res) => {
  return successResponse(res, {
    message: "Notification service is running",
  });
});

// Register API routes before the not-found and error handlers.
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/notification-deliveries", deliveryRoutes);
app.use("/api/v1/notification-preferences", preferenceRoutes);
app.use("/api/v1/push-subscriptions", subscriptionRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
