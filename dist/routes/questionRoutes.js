"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const questionController_1 = require("../controllers/questionController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// ---------- CRUD endpoints ----------
// Get all questions for a test – accessible to any authenticated user (including students)
router.get('/test/:testId', auth_1.authMiddleware, questionController_1.questionController.getByTestId);
// Create, update, delete, and upload are restricted to ADMIN/TEACHER only
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), questionController_1.questionController.create);
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), questionController_1.questionController.update);
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), questionController_1.questionController.delete);
// File upload endpoint for question attachments
router.post('/upload', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), upload_1.uploadQuestion.single('file'), questionController_1.questionController.uploadMedia);
exports.default = router;
