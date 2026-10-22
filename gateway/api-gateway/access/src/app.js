const express = require("express");
const cookieParser = require("cookie-parser");
const { isIP } = require("node:net");
const env = require("./config/env");
const redis = require("./config/redis");
const createRateLimiter = require("./middleware/rate-limit.middleware");
const authenticate = require("./middleware/auth.middleware");
const auth = require("./clients/auth.client");
const { routes, findRoute } = require("./config/routes");

const routeLimiters = new Map(routes.map(route => [route.name, createRateLimiter({
  name: route.name,
  limit: route.limit || env.ROUTE_LIMIT_MAX,
  windowMs: route.windowMs || env.ROUTE_WINDOW_MS,
})]));

const app = express();
app.disable("x-powered-by");

function responseHeaders(req, res, next) {
  const origin = req.get("Origin");
  if (env.CORS_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Credentials", "true");
  }
  next();
}

function checkClient(req, res, next) {
  req.clientIp = req.get("X-Client-IP");
  if (!isIP(req.clientIp || "")) {
    return res.set("X-Gateway-Status", "503").status(403).end();
  }
  req.routePolicy = findRoute(req.get("X-Original-Path") || "", req.get("X-Original-Method"));
  if (!req.routePolicy) {
    return res.set("X-Gateway-Status", "404").status(403).end();
  }
  if (req.get("X-Original-Method") === "OPTIONS") {
    return res.status(204).end();
  }
  next();
}

function limitRoute(req, res, next) {
  return routeLimiters.get(req.routePolicy.name)(req, res, next);
}

async function readiness(req, res) {
  try {
    const [pong, authReady] = await Promise.all([redis.ping(), auth.ready()]);
    if (pong !== "PONG" || !authReady) {
      return res.set("X-Gateway-Status", "503").status(403).end();
    }
    res.status(204).end();
  } catch {
    res.set("X-Gateway-Status", "503").status(403).end();
  }
}

app.use(responseHeaders, cookieParser());
app.get("/live", (req, res) => res.status(204).end());
app.get("/ready", readiness);
app.get("/check", checkClient, createRateLimiter(), limitRoute, authenticate, (req, res) => res.status(204).end());
app.use((req, res) => res.status(404).end());
app.use(function accessError(error, req, res, next) {
  console.error(JSON.stringify({ event: "gateway.access.check_failed" }));
  // Public 503: never forward unchecked requests when Redis or Auth fails.
  res.set("X-Gateway-Status", "503").status(403).end();
});

module.exports = app;
