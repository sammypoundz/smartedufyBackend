import { Router } from 'express';
import { feeController } from '../controllers/feeController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// Fee Structures
router.get('/structures', authMiddleware, feeController.getAllFeeStructures);
router.post('/structures', authMiddleware, privilegeGuard('fees'), feeController.createFeeStructure);
router.put('/structures/:id', authMiddleware, privilegeGuard('fees'), feeController.updateFeeStructure);
router.delete('/structures/:id', authMiddleware, privilegeGuard('fees'), feeController.deleteFeeStructure);

// Payments
router.get('/payments', authMiddleware, feeController.getAllPayments);
router.post('/payments', authMiddleware, privilegeGuard('fees'), feeController.recordPayment);

// Student assigned fees (NEW)
router.get('/students/:studentId/assigned-fees', authMiddleware, feeController.getStudentAssignedFees);

// Messages (email / SMS)
router.post('/messages', authMiddleware, privilegeGuard('fees', 'messaging'), feeController.sendMessage);

export default router;