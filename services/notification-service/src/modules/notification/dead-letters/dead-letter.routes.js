const express = require("express");
const authenticate = require("../../../middleware/auth.middleware");
const requireAdmin = require("../../../middleware/admin.middleware");
const validation = require("./dead-letter.validation");
const controller = require("./dead-letter.controller");

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get("/", validation.validateList, controller.list);
router.get("/:id", validation.validateId, controller.get);
router.post("/:id/replay", validation.validateId, validation.validateReplay, controller.replay);

module.exports = router;
