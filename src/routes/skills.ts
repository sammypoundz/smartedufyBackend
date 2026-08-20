import { Router } from 'express';
import { skillController } from '../controllers/skillController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Global skill CRUD ----------
router.get('/', authMiddleware, skillController.getAll);
router.get('/:id', authMiddleware, skillController.getById);
router.post('/', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), skillController.create);
router.patch('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), skillController.update);
router.put('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), skillController.update); // fallback for full update
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), skillController.delete);

// ---------- Arm‑specific skills ----------
router.get('/arm/:armId', authMiddleware, skillController.getByArmId);
router.post('/arm/:armId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), skillController.addToArm);
router.delete('/arm/:armId/:skillId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), skillController.removeFromArm);

// ---------- NEW: Skills by subject (for taughtIn relation) ----------
router.get('/subject/:subjectId', authMiddleware, skillController.getBySubjectId);

export default router;