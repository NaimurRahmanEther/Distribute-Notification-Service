const express = require("express");
const authenticate = require("../../middleware/auth.middleware");
const controller = require("./notification.controller");
const validation = require("./notification.validation");

const router = express.Router();

router.use(authenticate);
router.post("/", validation.validateCreate, controller.create);
router.get("/", validation.validateList, controller.list);
router.patch("/read-all", controller.markAllRead);
router.patch("/:id/read", validation.validateId, controller.markRead);
router.get("/:id", validation.validateId, controller.get);
router.delete("/:id", validation.validateId, controller.remove);

module.exports = router;
