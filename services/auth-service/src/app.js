const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const env = require("./config/env");
const requestLog = require("./middleware/request-log");
const authRoutes = require("./modules/auth/auth.routes");
const internalRoutes = require("./modules/internal/internal.routes");
const health = require("./modules/health/health.controller");
const notFound = require("./middleware/not-found");
const errorHandler = require("./middleware/errorHandler");

const app = express();
app.set("trust proxy", 2);
app.use(helmet(), requestLog);
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: "100kb" }), cookieParser());
app.get("/health/live", (req, res) => res.json({ status: "alive" }));
app.get("/health/ready", health.readiness);
app.use("/api/v1/auth", authRoutes);
app.use("/internal/v1", internalRoutes);
app.use(notFound, errorHandler);

module.exports = app;
