"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// Existing recent users endpoint
router.get('/recent', auth_1.authMiddleware, userController_1.userController.getRecentUsers);
// User management endpoints (require ADMIN role)
router.get('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), userController_1.userController.getAllUsers);
router.get('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), userController_1.userController.getUserById);
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), userController_1.userController.createUser);
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), userController_1.userController.updateUser);
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), userController_1.userController.deleteUser);
router.patch('/:id/status', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN']), userController_1.userController.updateStatus);
exports.default = router;
