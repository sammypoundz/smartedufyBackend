import { Router } from 'express';
import { userController } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// Existing recent users endpoint
router.get('/recent', authMiddleware, userController.getRecentUsers);

// User management endpoints (require ADMIN role)
router.get('/', authMiddleware, roleGuard(['ADMIN']), userController.getAllUsers);
router.get('/:id', authMiddleware, roleGuard(['ADMIN']), userController.getUserById);
router.post('/', authMiddleware, roleGuard(['ADMIN']), userController.createUser);
router.put('/:id', authMiddleware, roleGuard(['ADMIN']), userController.updateUser);
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), userController.deleteUser);
router.patch('/:id/status', authMiddleware, roleGuard(['ADMIN']), userController.updateStatus);

export default router;