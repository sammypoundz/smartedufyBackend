"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const testAttemptController_1 = require("../controllers/testAttemptController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ---------- Student submission (authenticated) ----------
router.post('/submit', auth_1.authMiddleware, testAttemptController_1.testAttemptController.submit);
// ---------- Admin/Teacher analytics ----------
// Get all attempts for a specific test (with student details)
router.get('/test/:testId', auth_1.authMiddleware, testAttemptController_1.testAttemptController.getByTestId);
// (Optional) Get a student's own attempts (for student dashboard)
router.get('/student/:studentId', auth_1.authMiddleware, testAttemptController_1.testAttemptController.getByStudentId);
exports.default = router;
