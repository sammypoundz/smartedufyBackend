import { Router } from 'express';
import { teacherController } from '../controllers/teacherController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// Get all teachers (any authenticated user)
router.get('/', authMiddleware, teacherController.getAll);

// Get a single teacher by ID
router.get('/:id', authMiddleware, teacherController.getById);

// Create a new teacher (admin only)
router.post('/', authMiddleware, roleGuard(['ADMIN']), teacherController.create);

// Update an existing teacher (admin only) – PUT for full update
router.put('/:id', authMiddleware, roleGuard(['ADMIN']), teacherController.update);

// Partial update (admin only) – for suspend/activate etc.
router.patch('/:id', authMiddleware, roleGuard(['ADMIN']), teacherController.update);

// Delete a teacher (admin only)
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), teacherController.delete);

// Reset teacher password (admin only)
router.post('/:id/reset-password', authMiddleware, roleGuard(['ADMIN']), teacherController.resetPassword);

export default router;