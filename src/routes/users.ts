import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// User management endpoints (require ADMIN role)
router.use(authMiddleware, privilegeGuard('user-management'));

// Existing recent users endpoint
router.get('/recent', userController.getRecentUsers);

// User management endpoints (require ADMIN role)
router.get('/', roleGuard(['ADMIN']), userController.getAllUsers);
router.get('/:id', roleGuard(['ADMIN']), userController.getUserById);
router.post('/', roleGuard(['ADMIN']), userController.createUser);
router.put('/:id', roleGuard(['ADMIN']), userController.updateUser);
router.delete('/:id', roleGuard(['ADMIN']), userController.deleteUser);
router.post('/bulk-delete', roleGuard(['ADMIN']), userController.bulkDelete);
router.patch('/:id/status', roleGuard(['ADMIN']), userController.updateStatus);

export default router;