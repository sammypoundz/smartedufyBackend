import { Router } from 'express';
import { payrollController } from '../controllers/payrollController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// All payroll endpoints require authentication and BURSAR/ADMIN role
router.get('/', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'ACCOUNTANT']), payrollController.getAllPayroll);
router.get('/staff', authMiddleware, payrollController.getStaffForPayroll);
router.post('/', authMiddleware, roleGuard(['ADMIN', 'BURSAR']), payrollController.createPayroll);
router.put('/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR']), payrollController.updatePayroll);
router.delete('/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR']), payrollController.deletePayroll);

export default router;