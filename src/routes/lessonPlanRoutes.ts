import { Router } from 'express';
import { lessonPlanController } from '../controllers/lessonPlanController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';
import { upload } from '../middleware/upload';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Routes for teachers and admins
router.get('/', lessonPlanController.getAll);
router.get('/:id', lessonPlanController.getById);
router.get('/:id/download', lessonPlanController.download);

router.post(
  '/',
  privilegeGuard('lesson-plan'),
  upload.single('file'),
  lessonPlanController.create
);

router.put(
  '/:id',
  privilegeGuard('lesson-plan'),
  upload.single('file'),
  lessonPlanController.update
);

router.delete('/:id', privilegeGuard('lesson-plan'), lessonPlanController.delete);

export default router;