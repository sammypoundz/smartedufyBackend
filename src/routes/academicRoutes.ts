import { Router } from 'express';
import { academicController } from '../controllers/academicController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// All routes require authentication (admin/teacher)
router.use(authMiddleware);

router.get('/grading-scales', academicController.getGradingScales);
router.post('/grading-scales/bulk', privilegeGuard('results'), academicController.saveGradingScales);

// Grading scale groups
router.get('/grading-scale-groups', academicController.getGradingScaleGroups);
router.post('/grading-scale-groups', privilegeGuard('results'), academicController.createGradingScaleGroup);
router.put('/grading-scale-groups/:id', privilegeGuard('results'), academicController.updateGradingScaleGroup);
router.delete('/grading-scale-groups/:id', privilegeGuard('results'), academicController.deleteGradingScaleGroup);
router.put('/classes/:classId/grading-scale-group', privilegeGuard('results'), academicController.assignGradingScaleGroupToClass);

router.get('/academic-years', academicController.getAcademicYears);
router.post('/academic-years', privilegeGuard('academic'), academicController.createAcademicYear);

router.get('/academic-session/current', academicController.getCurrentSession);
router.post('/academic-session/set', privilegeGuard('academic'), academicController.setCurrentSession);

// NEW: Push test attempt scores to student results (CA or Exam)
// Accessible to ADMIN and TEACHER only
router.post('/results/from-test-attempts', roleGuard(['ADMIN', 'TEACHER']), academicController.pushTestAttemptsToResults);

export default router;