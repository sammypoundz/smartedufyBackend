"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const teacherRegistrationController_1 = require("../controllers/teacherRegistrationController");
const router = (0, express_1.Router)();
// All admin-only: reviewing teacher self-registrations.
router.use(auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(["ADMIN", "PRINCIPAL"]));
// GET /api/teacher-registrations — list pending registrations
router.get("/", teacherRegistrationController_1.teacherRegistrationController.listPending);
// GET /api/teacher-registrations/count — sidebar badge count
router.get("/count", teacherRegistrationController_1.teacherRegistrationController.countPending);
// POST /api/teacher-registrations/:id/approve — approve + auto-assign
router.post("/:id/approve", teacherRegistrationController_1.teacherRegistrationController.approve);
// POST /api/teacher-registrations/:id/reject — reject
router.post("/:id/reject", teacherRegistrationController_1.teacherRegistrationController.reject);
exports.default = router;
