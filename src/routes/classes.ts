import { Router } from 'express';
import { classController } from '../controllers/classController';
import { armController } from '../controllers/armController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ==================== PUBLIC CLASS ROUTES (no auth) ====================
// Students need to see classes and arms before logging in
router.get('/', classController.getAll);                           // ✅ public
router.get('/:classId/arms', armController.getByClassId);          // ✅ public

// ==================== PROTECTED CLASS ROUTES ====================
/**
 * GET /api/classes/:id
 * Returns a single class with its arms, teacher, and students.
 */
router.get('/:id', authMiddleware, classController.getById);

/**
 * POST /api/classes
 * Create a new class (admin only)
 */
router.post('/', authMiddleware, roleGuard(['ADMIN']), classController.create);

/**
 * PUT /api/classes/:id
 * Update a class name (admin only)
 */
router.put('/:id', authMiddleware, roleGuard(['ADMIN']), classController.update);

/**
 * DELETE /api/classes/:id
 * Delete a class (admin only)
 */
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), classController.delete);

// ==================== PROTECTED ARM ROUTES ====================
/**
 * POST /api/arms
 * Create a new arm under a class (admin only)
 */
router.post('/arms', authMiddleware, roleGuard(['ADMIN']), armController.create);

/**
 * PATCH /api/arms/:id
 * Update an existing arm (admin only)
 */
router.patch('/arms/:id', authMiddleware, roleGuard(['ADMIN']), armController.update);

/**
 * DELETE /api/arms/:id
 * Delete an arm (admin only)
 */
router.delete('/arms/:id', authMiddleware, roleGuard(['ADMIN']), armController.delete);

export default router;