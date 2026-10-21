import { Router } from 'express';
import { testController } from '../controllers/testController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

router.get('/', authMiddleware, testController.getAll);
router.get('/:id', authMiddleware, testController.getById);
router.post('/', authMiddleware, privilegeGuard('cbt'), testController.create);
router.put('/:id', authMiddleware, privilegeGuard('cbt'), testController.update);
router.patch('/:id', authMiddleware, privilegeGuard('cbt'), testController.update); // for status toggles
router.delete('/:id', authMiddleware, privilegeGuard('cbt'), testController.delete);

export default router;