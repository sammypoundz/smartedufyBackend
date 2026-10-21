import { Router } from 'express';
import { promotionController } from '../controllers/promotionController';
import { authMiddleware } from '../middleware/auth';
import { privilegeGuard } from '../middleware/roleGuard';

const router = Router();
router.use(authMiddleware);
router.post('/promote', privilegeGuard('students'), promotionController.promote);
router.post('/bulk-promote', privilegeGuard('students'), promotionController.bulkPromote);
export default router;