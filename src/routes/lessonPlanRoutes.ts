import { Router } from 'express';
import { lessonPlanController } from '../controllers/lessonPlanController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';
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
  roleGuard(['ADMIN', 'TEACHER']),
  upload.single('file'),
  lessonPlanController.create
);

router.put(
  '/:id',
  roleGuard(['ADMIN', 'TEACHER']),
  upload.single('file'),
  lessonPlanController.update
);

router.delete('/:id', roleGuard(['ADMIN']), lessonPlanController.delete);

export default router;