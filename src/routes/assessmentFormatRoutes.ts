import { Router } from 'express';
import { assessmentFormatController } from '../controllers/assessmentFormatController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// All routes require authentication; CRUD is gated on the 'assessment-format'
// privilege so granted users get full access (ADMIN/PRINCIPAL implicitly pass).
router.use(authMiddleware, privilegeGuard('assessment-format'));

router.get('/', assessmentFormatController.getAll);
router.get('/:id', assessmentFormatController.getById);
router.post('/', assessmentFormatController.create);
router.put('/:id', assessmentFormatController.update);
router.delete('/:id', assessmentFormatController.delete);

export default router;