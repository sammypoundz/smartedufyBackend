"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subjectController_1 = require("../controllers/subjectController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// ---------- Arm‑specific subject routes (most specific first) ----------
router.get('/arm/:armId', auth_1.authMiddleware, subjectController_1.subjectController.getByArmId);
router.post('/arm/:armId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.addToArm);
router.patch('/arm-subjects/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.updateArmSubject);
router.delete('/arm/:armId/:subjectId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.removeFromArm);
// ✅ NEW: Delete a subject‑arm relation directly (used to remove a subject from a teacher)
router.delete('/subject-arms/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.deleteSubjectArm);
// ---------- Curriculum routes (full CRUD) ----------
router.get('/:id/curriculum', auth_1.authMiddleware, subjectController_1.subjectController.getCurriculum);
router.post('/:id/curriculum', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.createCurriculum);
router.put('/:id/curriculum/:topicId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.updateCurriculum);
router.patch('/:id/curriculum/:topicId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.updateTopicCompletion);
router.delete('/:id/curriculum/:topicId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), subjectController_1.subjectController.deleteCurriculum);
router.get('/:id/performance', auth_1.authMiddleware, subjectController_1.subjectController.getPerformance);
// ---------- Generic subject routes (must come last) ----------
router.get('/', auth_1.authMiddleware, subjectController_1.subjectController.getAll);
// Custom handler for /:id that checks for armId query parameter
router.get('/:id', auth_1.authMiddleware, (req, res) => {
    if (req.query.armId) {
        subjectController_1.subjectController.getByIdWithArm(req, res);
    }
    else {
        subjectController_1.subjectController.getById(req, res);
    }
});
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), subjectController_1.subjectController.create);
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), subjectController_1.subjectController.update);
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), subjectController_1.subjectController.delete);
exports.default = router;
