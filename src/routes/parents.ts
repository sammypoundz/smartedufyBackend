import { Router } from 'express';
import { parentController } from '../controllers/parentController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// Get all parents (admins and teachers – teachers need the list for dropdown)
router.get('/', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), parentController.getAll);

// Get a single parent by ID (includes their children)
router.get('/:id', authMiddleware, parentController.getById);

// Create a new parent (admins and teachers – teachers can create parents when assigning to a student)
router.post('/', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), parentController.create);

// Update an existing parent (admin only – sensitive operation)
router.put('/:id', authMiddleware, roleGuard(['ADMIN']), parentController.update);

// Delete a parent (admin only)
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), parentController.delete);

export default router;