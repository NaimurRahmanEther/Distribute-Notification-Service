
const express = require("express");

const authController = require("./auth.controller");

const {
  validateRegister,
  validateLogin,
} = require("./auth.validation");

const router = express.Router();

// Create a new account
router.post(
  "/register",
  validateRegister,
  authController.register
);

// Log in an existing user
router.post(
  "/login",
  validateLogin,
  authController.login
);

// Refresh the access token for the current session
router.post("/refresh", authController.refresh);

// Log out the current refresh-token session
router.post(
  "/logout",
  authController.logout
);

module.exports = router;
