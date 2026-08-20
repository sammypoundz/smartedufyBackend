"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const studentController_1 = require("../controllers/studentController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// ---------- Public / special routes (no auth or student-specific) ----------
router.get('/validate', studentController_1.studentController.validateByAdmission); // public
// Authenticated student "me" endpoint
router.get('/me', auth_1.authMiddleware, studentController_1.studentController.getMe); // student uses their own token
// ---------- Static / specific prefix routes ----------
router.get('/arm/:armId', auth_1.authMiddleware, studentController_1.studentController.getByArm);
router.get('/class/:classId', auth_1.authMiddleware, studentController_1.studentController.getByClass);
router.get('/parents', auth_1.authMiddleware, studentController_1.studentController.getAllParents);
router.post('/parents', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), studentController_1.studentController.createParent);
// ---------- Routes with student ID + subpath ----------
router.get('/:id/subjects', auth_1.authMiddleware, studentController_1.studentController.getStudentSubjects);
router.put('/:id/subjects', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), studentController_1.studentController.updateStudentSubjects);
router.get('/:id/attendance', auth_1.authMiddleware, studentController_1.studentController.getStudentAttendance);
router.get('/:id/fees', auth_1.authMiddleware, studentController_1.studentController.getStudentFees);
router.get('/:id/results', auth_1.authMiddleware, studentController_1.studentController.getStudentResults);
router.post('/:id/assign-parent', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), studentController_1.studentController.assignParent);
// ✅ NEW: Unassign parent
router.patch('/:id/unassign-parent', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), studentController_1.studentController.unassignParent);
// ---------- Generic student CRUD (must come after more specific routes) ----------
router.get('/', auth_1.authMiddleware, studentController_1.studentController.getAll);
router.get('/:id', auth_1.authMiddleware, studentController_1.studentController.getById);
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), studentController_1.studentController.create);
router.patch('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), studentController_1.studentController.update);
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), studentController_1.studentController.delete);
exports.default = router;
