import { Router } from 'express';
import { academicController } from '../controllers/academicController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// All routes require authentication (admin/teacher)
router.use(authMiddleware);

router.get('/grading-scales', academicController.getGradingScales);
router.post('/grading-scales/bulk', roleGuard(['ADMIN']), academicController.saveGradingScales);

router.get('/academic-years', academicController.getAcademicYears);
router.post('/academic-years', roleGuard(['ADMIN']), academicController.createAcademicYear);

router.get('/academic-session/current', academicController.getCurrentSession);
router.post('/academic-session/set', roleGuard(['ADMIN']), academicController.setCurrentSession);

// NEW: Push test attempt scores to student results (CA or Exam)
// Accessible to ADMIN and TEACHER only
router.post('/results/from-test-attempts', roleGuard(['ADMIN', 'TEACHER']), academicController.pushTestAttemptsToResults);

export default router;