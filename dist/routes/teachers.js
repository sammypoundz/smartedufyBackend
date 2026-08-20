"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const teacherController_1 = require("../controllers/teacherController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// Get all teachers (any authenticated user)
router.get('/', auth_1.authMiddleware, teacherController_1.teacherController.getAll);
// Get a single teacher by ID
router.get('/:id', auth_1.authMiddleware, teacherController_1.teacherController.getById);
// Create a new teacher (admin only)
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), teacherController_1.teacherController.create);
// Update an existing teacher (admin only) – PUT for full update
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), teacherController_1.teacherController.update);
// Partial update (admin only) – for suspend/activate etc.
router.patch('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), teacherController_1.teacherController.update);
// Delete a teacher (admin only)
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), teacherController_1.teacherController.delete);
// Reset teacher password (admin only)
router.post('/:id/reset-password', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), teacherController_1.teacherController.resetPassword);
exports.default = router;
