import { Router } from 'express';
import { questionController } from '../controllers/questionController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';
import { uploadQuestion } from '../middleware/upload';

const router = Router();

// ---------- CRUD endpoints ----------
// Question bank — all questions in the school
router.get('/bank', authMiddleware, privilegeGuard('cbt'), questionController.getBank);

// Get all questions for a test – accessible to any authenticated user (including students)
router.get('/test/:testId', authMiddleware, questionController.getByTestId);

// Create, update, delete, and upload require the 'cbt' privilege
router.post('/', authMiddleware, privilegeGuard('cbt'), questionController.create);
router.put('/:id', authMiddleware, privilegeGuard('cbt'), questionController.update);
router.delete('/:id', authMiddleware, privilegeGuard('cbt'), questionController.delete);

// File upload endpoint for question attachments
router.post(
  '/upload',
  authMiddleware,
  privilegeGuard('cbt'),
  uploadQuestion.single('file'),
  questionController.uploadMedia
);

export default router;