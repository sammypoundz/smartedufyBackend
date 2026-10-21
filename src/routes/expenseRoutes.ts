import { Router } from 'express';
import { expenseController } from '../controllers/expenseController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

router.get('/', authMiddleware, expenseController.getAll);
router.get('/:id', authMiddleware, expenseController.getById);
router.post('/', authMiddleware, privilegeGuard('expenses'), expenseController.create);
router.put('/:id', authMiddleware, privilegeGuard('expenses'), expenseController.update);
router.delete('/:id', authMiddleware, privilegeGuard('expenses'), expenseController.delete);

export default router;