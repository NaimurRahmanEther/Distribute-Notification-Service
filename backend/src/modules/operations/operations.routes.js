const router = require("express").Router();
const authenticate = require("../../middleware/auth.middleware");
const requireAdmin = require("../../middleware/admin.middleware");
const controller = require("./operations.controller");

router.use(authenticate, requireAdmin);
router.get("/metrics", controller.metrics);

module.exports = router;
