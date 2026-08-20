"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const skillController_1 = require("../controllers/skillController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// ---------- Global skill CRUD ----------
router.get('/', auth_1.authMiddleware, skillController_1.skillController.getAll);
router.get('/:id', auth_1.authMiddleware, skillController_1.skillController.getById);
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), skillController_1.skillController.create);
router.patch('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), skillController_1.skillController.update);
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), skillController_1.skillController.update); // fallback for full update
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), skillController_1.skillController.delete);
// ---------- Arm‑specific skills ----------
router.get('/arm/:armId', auth_1.authMiddleware, skillController_1.skillController.getByArmId);
router.post('/arm/:armId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), skillController_1.skillController.addToArm);
router.delete('/arm/:armId/:skillId', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), skillController_1.skillController.removeFromArm);
// ---------- NEW: Skills by subject (for taughtIn relation) ----------
router.get('/subject/:subjectId', auth_1.authMiddleware, skillController_1.skillController.getBySubjectId);
exports.default = router;
