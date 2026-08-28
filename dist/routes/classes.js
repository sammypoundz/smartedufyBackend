"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const classController_1 = require("../controllers/classController");
const armController_1 = require("../controllers/armController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// ==================== PUBLIC CLASS ROUTES (no auth) ====================
// Students need to see classes and arms before logging in
router.get('/', classController_1.classController.getAll); // ✅ public
router.get('/:classId/arms', armController_1.armController.getByClassId); // ✅ public
// ==================== PROTECTED CLASS ROUTES ====================
/**
 * GET /api/classes/:id
 * Returns a single class with its arms, teacher, and students.
 */
router.get('/:id', auth_1.authMiddleware, classController_1.classController.getById);
/**
 * POST /api/classes
 * Create a new class (admin only)
 */
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), classController_1.classController.create);
/**
 * PUT /api/classes/:id
 * Update a class name (admin only)
 */
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), classController_1.classController.update);
/**
 * DELETE /api/classes/:id
 * Delete a class (admin only)
 */
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), classController_1.classController.delete);
// ==================== PROTECTED ARM ROUTES ====================
/**
 * POST /api/arms
 * Create a new arm under a class (admin only)
 */
router.post('/arms', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), armController_1.armController.create);
/**
 * PATCH /api/arms/:id
 * Update an existing arm (admin only)
 */
router.patch('/arms/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), armController_1.armController.update);
/**
 * DELETE /api/arms/:id
 * Delete an arm (admin only)
 */
router.delete('/arms/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), armController_1.armController.delete);
exports.default = router;
