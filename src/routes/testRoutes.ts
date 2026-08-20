import { Router } from 'express';
import { testController } from '../controllers/testController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

router.get('/', authMiddleware, testController.getAll);
router.get('/:id', authMiddleware, testController.getById);
router.post('/', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), testController.create);
router.put('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), testController.update);
router.patch('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), testController.update); // for status toggles
router.delete('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), testController.delete);

export default router;