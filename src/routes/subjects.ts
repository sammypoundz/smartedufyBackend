import { Router } from 'express';
import { subjectController } from '../controllers/subjectController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Arm‑specific subject routes (most specific first) ----------
router.get('/arm/:armId', authMiddleware, subjectController.getByArmId);
router.post('/arm/:armId', authMiddleware, privilegeGuard('subjects'), subjectController.addToArm);
router.patch('/arm-subjects/:id', authMiddleware, privilegeGuard('subjects'), subjectController.updateArmSubject);
router.delete('/arm/:armId/:subjectId', authMiddleware, privilegeGuard('subjects'), subjectController.removeFromArm);

// ✅ NEW: Delete a subject‑arm relation directly (used to remove a subject from a teacher)
router.delete('/subject-arms/:id', authMiddleware, privilegeGuard('subjects'), subjectController.deleteSubjectArm);

// ---------- Curriculum routes (full CRUD) ----------
router.get('/:id/curriculum', authMiddleware, subjectController.getCurriculum);
router.post('/:id/curriculum', authMiddleware, privilegeGuard('subjects'), subjectController.createCurriculum);
router.put('/:id/curriculum/:topicId', authMiddleware, privilegeGuard('subjects'), subjectController.updateCurriculum);
router.patch('/:id/curriculum/:topicId', authMiddleware, privilegeGuard('subjects'), subjectController.updateTopicCompletion);
router.delete('/:id/curriculum/:topicId', authMiddleware, privilegeGuard('subjects'), subjectController.deleteCurriculum);
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

router.post('/', authMiddleware, privilegeGuard('subjects'), subjectController.create);
router.put('/:id', authMiddleware, privilegeGuard('subjects'), subjectController.update);
router.delete('/:id', authMiddleware, privilegeGuard('subjects'), subjectController.delete);

export default router;