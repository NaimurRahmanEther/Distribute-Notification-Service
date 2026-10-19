const express = require("express");
const authenticate = require("../../../middleware/auth.middleware");
const controller = require("./push-subscription.controller");
const validation = require("./push-subscription.validation");

const router = express.Router();
router.use(authenticate);
router.get("/public-key", controller.publicKey);
router.get("/", controller.list);
router.post("/", validation.validateCreate, controller.create);
router.delete("/:id", validation.validateId, controller.remove);

module.exports = router;
