import { Router } from 'express';
import { feeController } from '../controllers/feeController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// Fee Structures
router.get('/structures', authMiddleware, feeController.getAllFeeStructures);
router.post('/structures', authMiddleware, roleGuard(['ADMIN', 'BURSAR']), feeController.createFeeStructure);
router.put('/structures/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR']), feeController.updateFeeStructure);
router.delete('/structures/:id', authMiddleware, roleGuard(['ADMIN', 'BURSAR']), feeController.deleteFeeStructure);

// Payments
router.get('/payments', authMiddleware, feeController.getAllPayments);
router.post('/payments', authMiddleware, roleGuard(['ADMIN', 'BURSAR']), feeController.recordPayment);

// Student assigned fees (NEW)
router.get('/students/:studentId/assigned-fees', authMiddleware, feeController.getStudentAssignedFees);

// Messages (email / SMS)
router.post('/messages', authMiddleware, roleGuard(['ADMIN', 'BURSAR', 'TEACHER']), feeController.sendMessage);

export default router;