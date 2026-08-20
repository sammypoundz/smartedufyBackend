"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const parentController_1 = require("../controllers/parentController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// Get all parents (admins and teachers – teachers need the list for dropdown)
router.get('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), parentController_1.parentController.getAll);
// Get a single parent by ID (includes their children)
router.get('/:id', auth_1.authMiddleware, parentController_1.parentController.getById);
// Create a new parent (admins and teachers – teachers can create parents when assigning to a student)
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), parentController_1.parentController.create);
// Update an existing parent (admin only – sensitive operation)
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), parentController_1.parentController.update);
// Delete a parent (admin only)
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), parentController_1.parentController.delete);
exports.default = router;
