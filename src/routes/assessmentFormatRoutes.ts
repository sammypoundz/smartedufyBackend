import { Router } from 'express';
import { assessmentFormatController } from '../controllers/assessmentFormatController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// All routes require authentication and admin role
router.use(authMiddleware, roleGuard(['ADMIN']));

router.get('/', assessmentFormatController.getAll);
router.get('/:id', assessmentFormatController.getById);
router.post('/', assessmentFormatController.create);
router.put('/:id', assessmentFormatController.update);
router.delete('/:id', assessmentFormatController.delete);

export default router;