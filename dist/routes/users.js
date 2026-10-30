"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// User management endpoints — gated on the 'user-management' privilege so
// granted non-admin users get full CRUD, not just read-only.
router.use(auth_1.authMiddleware, (0, roleGuard_1.privilegeGuard)('users'));
// Existing recent users endpoint
router.get('/recent', userController_1.userController.getRecentUsers);
// Preview the next auto-generated ID for a role (before saving the user).
// MUST be registered before '/:id' so 'next-id' is not treated as an id.
router.get('/next-id', userController_1.userController.getNextId);
// User management endpoints (gated on the 'user-management' privilege)
router.get('/', userController_1.userController.getAllUsers);
router.get('/:id', userController_1.userController.getUserById);
router.post('/', userController_1.userController.createUser);
router.put('/:id', userController_1.userController.updateUser);
router.delete('/:id', userController_1.userController.deleteUser);
router.post('/bulk-delete', userController_1.userController.bulkDelete);
router.patch('/:id/status', userController_1.userController.updateStatus);
exports.default = router;
