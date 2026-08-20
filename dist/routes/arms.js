"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const armController_1 = require("../controllers/armController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// ---------- Specific routes (no :id param) ----------
// Get all arms for a specific class
router.get('/class/:classId', auth_1.authMiddleware, armController_1.armController.getByClassId);
// Get all arms (with class relation) – used in teacher management
router.get('/', auth_1.authMiddleware, armController_1.armController.getAll);
// Direct subject‑arm deletion (used to remove a subject from a teacher)
router.delete('/subject-arms/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), armController_1.armController.deleteSubjectArm);
// ---------- Routes with :armId prefix ----------
// Get simplified list of subjects for an arm (used by results page)
router.get('/:armId/subjects/list', auth_1.authMiddleware, armController_1.armController.getArmSubjectsList);
// Get students in an arm (used by results page)
router.get('/:armId/students', auth_1.authMiddleware, armController_1.armController.getArmStudents);
// Get all subjects assigned to an arm (with teacher details) – detailed view
router.get('/:armId/subjects', auth_1.authMiddleware, armController_1.armController.getArmSubjects);
// Add a subject to an arm (admin or teacher)
router.post('/:armId/subjects', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), armController_1.armController.addSubjectToArm);
// Update the teacher for a subject assigned to an arm
router.patch('/:armId/subjects/:subjectId/teacher', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), armController_1.armController.updateArmSubjectTeacher);
// Remove a subject from an arm
router.delete('/:armId/subjects/:subjectId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), armController_1.armController.removeArmSubject);
// Add a skill to an arm (admin or teacher)
router.post('/:armId/skills', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), armController_1.armController.addSkillToArm);
// ---------- Generic arm CRUD (must come last, after all routes with specific prefixes) ----------
// Get a single arm by its ID (used in OpenArm page)
router.get('/:id', auth_1.authMiddleware, armController_1.armController.getById);
// Create a new arm (admin only)
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), armController_1.armController.create);
// Update an existing arm (admin only)
router.patch('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), armController_1.armController.update);
// Delete an arm (admin only)
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), armController_1.armController.delete);
exports.default = router;
