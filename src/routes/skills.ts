import { Router } from 'express';
import { skillController } from '../controllers/skillController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Global skill CRUD ----------
router.get('/', authMiddleware, skillController.getAll);
router.get('/:id', authMiddleware, skillController.getById);
router.post('/', authMiddleware, privilegeGuard('results'), skillController.create);
router.patch('/:id', authMiddleware, privilegeGuard('results'), skillController.update);
router.put('/:id', authMiddleware, privilegeGuard('results'), skillController.update); // fallback for full update
router.delete('/:id', authMiddleware, privilegeGuard('results'), skillController.delete);

// ---------- Arm‑specific skills ----------
router.get('/arm/:armId', authMiddleware, skillController.getByArmId);
router.post('/arm/:armId', authMiddleware, privilegeGuard('results'), skillController.addToArm);
router.delete('/arm/:armId/:skillId', authMiddleware, privilegeGuard('results'), skillController.removeFromArm);

// ---------- NEW: Skills by subject (for taughtIn relation) ----------
router.get('/subject/:subjectId', authMiddleware, skillController.getBySubjectId);

export default router;