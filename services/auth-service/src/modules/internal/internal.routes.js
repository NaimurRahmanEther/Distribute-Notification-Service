const router = require("express").Router();
const authenticateService = require("../../middleware/service-auth.middleware");
const validation = require("./internal.validation");
const controller = require("./internal.controller");

router.use(authenticateService);
router.post("/auth/introspect", validation.validateToken, controller.introspect);
router.get("/users/:id", validation.validateUser, controller.getUser);

module.exports = router;
