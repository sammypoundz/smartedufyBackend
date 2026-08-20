"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const lessonPlanController_1 = require("../controllers/lessonPlanController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_1.authMiddleware);
// Routes for teachers and admins
router.get('/', lessonPlanController_1.lessonPlanController.getAll);
router.get('/:id', lessonPlanController_1.lessonPlanController.getById);
router.get('/:id/download', lessonPlanController_1.lessonPlanController.download);
router.post('/', (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), upload_1.upload.single('file'), lessonPlanController_1.lessonPlanController.create);
router.put('/:id', (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), upload_1.upload.single('file'), lessonPlanController_1.lessonPlanController.update);
router.delete('/:id', (0, roleGuard_1.roleGuard)(['ADMIN']), lessonPlanController_1.lessonPlanController.delete);
exports.default = router;
