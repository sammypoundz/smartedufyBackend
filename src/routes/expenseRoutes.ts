import { Router } from 'express';
import { expenseController } from '../controllers/expenseController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

router.get('/', authMiddleware, expenseController.getAll);
router.get('/:id', authMiddleware, expenseController.getById);
router.post('/', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'ACCOUNTANT']), expenseController.create);
router.put('/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'ACCOUNTANT']), expenseController.update);
router.delete('/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'ACCOUNTANT']), expenseController.delete);

export default router;