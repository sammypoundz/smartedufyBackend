import { Router } from 'express';
import { promotionController } from '../controllers/promotionController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();
router.use(authMiddleware);
router.post('/promote', roleGuard(['ADMIN']), promotionController.promote);
router.post('/bulk-promote', roleGuard(['ADMIN']), promotionController.bulkPromote);
export default router;