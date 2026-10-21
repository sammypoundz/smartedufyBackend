import { Router } from 'express';
import { budgetController } from '../controllers/budgetController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

router.get('/', authMiddleware, budgetController.getAllBudgets);
router.post('/', authMiddleware, privilegeGuard('expenses'), budgetController.createBudget);
router.put('/:id', authMiddleware, privilegeGuard('expenses'), budgetController.updateBudget);
router.delete('/:id', authMiddleware, privilegeGuard('expenses'), budgetController.deleteBudget);

export default router;