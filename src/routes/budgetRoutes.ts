import { Router } from 'express';
import { budgetController } from '../controllers/budgetController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

router.get('/', authMiddleware, budgetController.getAllBudgets);
router.post('/', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'ACCOUNTANT']), budgetController.createBudget);
router.put('/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'ACCOUNTANT']), budgetController.updateBudget);
router.delete('/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'ACCOUNTANT']), budgetController.deleteBudget);

export default router;