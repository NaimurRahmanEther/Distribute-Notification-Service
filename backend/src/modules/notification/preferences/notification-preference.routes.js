const express = require("express");
const authenticate = require("../../../middleware/auth.middleware");
const controller = require("./notification-preference.controller");
const { validateUpdate } = require("./notification-preference.validation");

const router = express.Router();
router.use(authenticate);
router.get("/", controller.get);
router.put("/", validateUpdate, controller.update);

module.exports = router;
