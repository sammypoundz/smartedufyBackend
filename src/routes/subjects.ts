import { Router } from 'express';
import { subjectController } from '../controllers/subjectController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Arm‑specific subject routes (most specific first) ----------
router.get('/arm/:armId', authMiddleware, subjectController.getByArmId);
router.post('/arm/:armId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.addToArm);
router.patch('/arm-subjects/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.updateArmSubject);
router.delete('/arm/:armId/:subjectId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.removeFromArm);

// ✅ NEW: Delete a subject‑arm relation directly (used to remove a subject from a teacher)
router.delete('/subject-arms/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.deleteSubjectArm);

// ---------- Curriculum routes (full CRUD) ----------
router.get('/:id/curriculum', authMiddleware, subjectController.getCurriculum);
router.post('/:id/curriculum', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.createCurriculum);
router.put('/:id/curriculum/:topicId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.updateCurriculum);
router.patch('/:id/curriculum/:topicId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.updateTopicCompletion);
router.delete('/:id/curriculum/:topicId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), subjectController.deleteCurriculum);
router.get('/:id/performance', authMiddleware, subjectController.getPerformance);

// ---------- Generic subject routes (must come last) ----------
router.get('/', authMiddleware, subjectController.getAll);

// Custom handler for /:id that checks for armId query parameter
router.get('/:id', authMiddleware, (req, res) => {
  if (req.query.armId) {
    subjectController.getByIdWithArm(req, res);
  } else {
    subjectController.getById(req, res);
  }
});

router.post('/', authMiddleware, roleGuard(['ADMIN']), subjectController.create);
router.put('/:id', authMiddleware, roleGuard(['ADMIN']), subjectController.update);
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), subjectController.delete);

export default router;