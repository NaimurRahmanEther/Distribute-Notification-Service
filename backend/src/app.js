const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const authRoutes = require("./modules/auth/auth.routes");
const notificationRoutes = require("./modules/notificaitons/notification.routes");
const notFound = require("./middleware/not-found");
const errorHandler = require("./middleware/errorHandler");
const { successResponse } = require("./shared/utils/api-response");
const morgan=require('morgan')

const app = express();

app.use(helmet());
app.use(morgan('dev'))
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
app.use(notFound);
app.use(errorHandler);

module.exports = app;
