import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';
import { privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// User management endpoints — gated on the 'user-management' privilege so
// granted non-admin users get full CRUD, not just read-only.
router.use(authMiddleware, privilegeGuard('users'));

// Existing recent users endpoint
router.get('/recent', userController.getRecentUsers);

// Preview the next auto-generated ID for a role (before saving the user).
// MUST be registered before '/:id' so 'next-id' is not treated as an id.
router.get('/next-id', userController.getNextId);

// User management endpoints (gated on the 'user-management' privilege)
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);
router.post('/bulk-delete', userController.bulkDelete);
router.patch('/:id/status', userController.updateStatus);

export default router;