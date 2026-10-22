const express = require("express");
const authenticate = require("../../../middleware/auth.middleware");
const controller = require("./notification-delivery.controller");
const validation = require("./notification-delivery.validation");

const router = express.Router();
router.use(authenticate);
router.get("/", validation.validateList, controller.list);
router.get("/:id", validation.validateId, controller.get);

module.exports = router;
