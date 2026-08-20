import { Router } from 'express';
import { armController } from '../controllers/armController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Specific routes (no :id param) ----------
// Get all arms for a specific class
router.get('/class/:classId', authMiddleware, armController.getByClassId);

// Get all arms (with class relation) – used in teacher management
router.get('/', authMiddleware, armController.getAll);

// Direct subject‑arm deletion (used to remove a subject from a teacher)
router.delete('/subject-arms/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), armController.deleteSubjectArm);

// ---------- Routes with :armId prefix ----------
// Get simplified list of subjects for an arm (used by results page)
router.get('/:armId/subjects/list', authMiddleware, armController.getArmSubjectsList);

// Get students in an arm (used by results page)
router.get('/:armId/students', authMiddleware, armController.getArmStudents);

// Get all subjects assigned to an arm (with teacher details) – detailed view
router.get('/:armId/subjects', authMiddleware, armController.getArmSubjects);

// Add a subject to an arm (admin or teacher)
router.post('/:armId/subjects', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), armController.addSubjectToArm);

// Update the teacher for a subject assigned to an arm
router.patch('/:armId/subjects/:subjectId/teacher', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), armController.updateArmSubjectTeacher);

// Remove a subject from an arm
router.delete('/:armId/subjects/:subjectId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), armController.removeArmSubject);

// Add a skill to an arm (admin or teacher)
router.post('/:armId/skills', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), armController.addSkillToArm);

// ---------- Generic arm CRUD (must come last, after all routes with specific prefixes) ----------
// Get a single arm by its ID (used in OpenArm page)
router.get('/:id', authMiddleware, armController.getById);

// Create a new arm (admin only)
router.post('/', authMiddleware, roleGuard(['ADMIN']), armController.create);

// Update an existing arm (admin only)
router.patch('/:id', authMiddleware, roleGuard(['ADMIN']), armController.update);

// Delete an arm (admin only)
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), armController.delete);

export default router;