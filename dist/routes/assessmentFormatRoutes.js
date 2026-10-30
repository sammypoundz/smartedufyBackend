"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assessmentFormatController_1 = require("../controllers/assessmentFormatController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// All routes require authentication; CRUD is gated on the 'assessment-format'
// privilege so granted users get full access (ADMIN/PRINCIPAL implicitly pass).
router.use(auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('assessment-format'));
router.get('/', assessmentFormatController_1.assessmentFormatController.getAll);
router.get('/:id', assessmentFormatController_1.assessmentFormatController.getById);
router.post('/', assessmentFormatController_1.assessmentFormatController.create);
router.put('/:id', assessmentFormatController_1.assessmentFormatController.update);
router.delete('/:id', assessmentFormatController_1.assessmentFormatController.delete);
exports.default = router;
