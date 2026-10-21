import { Router } from 'express';
import { payrollController } from '../controllers/payrollController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// Payroll is privilege-gated: any user holding the 'payroll' privilege (via
// their role or a direct grant) has full CRUD — ADMIN/PRINCIPAL implicitly pass.
router.use(authMiddleware, privilegeGuard('payroll'));

router.get('/', payrollController.getAllPayroll);
router.get('/staff', payrollController.getStaffForPayroll);
router.post('/', payrollController.createPayroll);
router.put('/:id', payrollController.updatePayroll);
router.delete('/:id', payrollController.deletePayroll);

export default router;