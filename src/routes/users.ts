import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// User management endpoints (require ADMIN role)
router.use(authMiddleware, privilegeGuard('user-management'));

// Existing recent users endpoint
router.get('/recent', userController.getRecentUsers);

// Preview the next auto-generated ID for a role (before saving the user).
// MUST be registered before '/:id' so 'next-id' is not treated as an id.
router.get('/next-id', roleGuard(['ADMIN']), userController.getNextId);

// User management endpoints (require ADMIN role)
router.get('/', roleGuard(['ADMIN']), userController.getAllUsers);
router.get('/:id', roleGuard(['ADMIN']), userController.getUserById);
router.post('/', roleGuard(['ADMIN']), userController.createUser);
router.put('/:id', roleGuard(['ADMIN']), userController.updateUser);
router.delete('/:id', roleGuard(['ADMIN']), userController.deleteUser);
router.post('/bulk-delete', roleGuard(['ADMIN']), userController.bulkDelete);
router.patch('/:id/status', roleGuard(['ADMIN']), userController.updateStatus);

export default router;