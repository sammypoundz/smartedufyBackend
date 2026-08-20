"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const academicController_1 = require("../controllers/academicController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// All routes require authentication (admin/teacher)
router.use(auth_1.authMiddleware);
router.get('/grading-scales', academicController_1.academicController.getGradingScales);
router.post('/grading-scales/bulk', (0, roleGuard_1.roleGuard)(['ADMIN']), academicController_1.academicController.saveGradingScales);
router.get('/academic-years', academicController_1.academicController.getAcademicYears);
router.post('/academic-years', (0, roleGuard_1.roleGuard)(['ADMIN']), academicController_1.academicController.createAcademicYear);
router.get('/academic-session/current', academicController_1.academicController.getCurrentSession);
router.post('/academic-session/set', (0, roleGuard_1.roleGuard)(['ADMIN']), academicController_1.academicController.setCurrentSession);
// NEW: Push test attempt scores to student results (CA or Exam)
// Accessible to ADMIN and TEACHER only
router.post('/results/from-test-attempts', (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), academicController_1.academicController.pushTestAttemptsToResults);
exports.default = router;
