
const express = require("express");

const authController = require("./auth.controller");
const {
  registerLimiter,
  loginLimiter,
  refreshLimiter,
  logoutLimiter,
} = require("./auth.rate-limit");

const {
  validateRegister,
  validateLogin,
} = require("./auth.validation");

const router = express.Router();

// Create a new account
router.post(
  "/register",
  registerLimiter,
  validateRegister,
  authController.register
);

// Log in an existing user
router.post(
  "/login",
  loginLimiter,
  validateLogin,
  authController.login
);

// Refresh the access token for the current session
router.post("/refresh", refreshLimiter, authController.refresh);

// Log out the current refresh-token session
router.post(
  "/logout",
  logoutLimiter,
  authController.logout
);

module.exports = router;
