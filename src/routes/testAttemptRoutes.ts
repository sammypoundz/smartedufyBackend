import { Router } from 'express';
import { testAttemptController } from '../controllers/testAttemptController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Student submission (authenticated) ----------
router.post('/submit', authMiddleware, testAttemptController.submit);

// ---------- Admin/Teacher analytics ----------
// Get all attempts for a specific test (with student details)
router.get('/test/:testId', authMiddleware, testAttemptController.getByTestId);

// (Optional) Get a student's own attempts (for student dashboard)
router.get('/student/:studentId', authMiddleware, testAttemptController.getByStudentId);

export default router;