import { Router } from 'express';
import { questionController } from '../controllers/questionController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';
import { uploadQuestion } from '../middleware/upload';

const router = Router();

// ---------- CRUD endpoints ----------
// Get all questions for a test – accessible to any authenticated user (including students)
router.get('/test/:testId', authMiddleware, questionController.getByTestId);

// Create, update, delete, and upload are restricted to ADMIN/TEACHER only
router.post('/', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), questionController.create);
router.put('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), questionController.update);
router.delete('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), questionController.delete);

// File upload endpoint for question attachments
router.post(
  '/upload',
  authMiddleware,
  roleGuard(['ADMIN', 'TEACHER']),
  uploadQuestion.single('file'),
  questionController.uploadMedia
);

export default router;