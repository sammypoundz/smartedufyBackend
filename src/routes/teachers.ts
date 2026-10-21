import { Router } from 'express';
import { teacherController } from '../controllers/teacherController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// Get all teachers (any authenticated user)
router.get('/', authMiddleware, teacherController.getAll);

// ✅ GET /api/teachers/me - Get authenticated teacher's profile (must come BEFORE /:id)
router.get('/me', authMiddleware, teacherController.getMe);

// ✅ PATCH /api/teachers/me - Self-service profile setup (teacher fills their own phone/name)
router.patch('/me', authMiddleware, teacherController.updateMe);

// Get a single teacher by ID
router.get('/:id', authMiddleware, teacherController.getById);

// Teacher management is privilege-gated: holders of 'teachers' (or the
// broader 'staff' privilege) have full CRUD — ADMIN/PRINCIPAL implicitly pass.
router.post('/', authMiddleware, privilegeGuard('teachers', 'staff'), teacherController.create);

// Update an existing teacher (admin only) – PUT for full update
router.put('/:id', authMiddleware, privilegeGuard('teachers', 'staff'), teacherController.update);

// Partial update (admin only) – for suspend/activate etc.
router.patch('/:id', authMiddleware, privilegeGuard('teachers', 'staff'), teacherController.update);

// Delete a teacher (admin only)
router.delete('/:id', authMiddleware, privilegeGuard('teachers', 'staff'), teacherController.delete);

// Reset teacher password (admin only)
router.post('/:id/reset-password', authMiddleware, privilegeGuard('teachers', 'staff'), teacherController.resetPassword);

export default router;