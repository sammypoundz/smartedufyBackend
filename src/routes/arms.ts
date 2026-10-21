import { Router } from 'express';
import { armController } from '../controllers/armController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Specific routes (no :id param) ----------
// Get all arms for a specific class
router.get('/class/:classId', authMiddleware, armController.getByClassId);

// Get the authenticated teacher's class assignments
router.get('/my-assignments', authMiddleware, roleGuard(['TEACHER']), armController.getMyAssignments);

// Get all arms (with class relation) – used in teacher management
router.get('/', authMiddleware, armController.getAll);

// Direct subject‑arm deletion (used to remove a subject from a teacher)
router.delete('/subject-arms/:id', authMiddleware, privilegeGuard('subjects'), armController.deleteSubjectArm);

// ---------- Routes with :armId prefix ----------
// Get simplified list of subjects for an arm (used by results page)
router.get('/:armId/subjects/list', authMiddleware, armController.getArmSubjectsList);

// Get students in an arm (used by results page)
router.get('/:armId/students', authMiddleware, armController.getArmStudents);

// Get all subjects assigned to an arm (with teacher details) – detailed view
router.get('/:armId/subjects', authMiddleware, armController.getArmSubjects);

// Add a subject to an arm (admin or teacher)
router.post('/:armId/subjects', authMiddleware, privilegeGuard('subjects'), armController.addSubjectToArm);

// Update the teacher for a subject assigned to an arm
router.patch('/:armId/subjects/:subjectId/teacher', authMiddleware, privilegeGuard('subjects'), armController.updateArmSubjectTeacher);

// Remove a subject from an arm
router.delete('/:armId/subjects/:subjectId', authMiddleware, privilegeGuard('subjects'), armController.removeArmSubject);

// Add a skill to an arm (admin or teacher)
router.post('/:armId/skills', authMiddleware, privilegeGuard('subjects'), armController.addSkillToArm);

// ---------- Generic arm CRUD (must come last, after all routes with specific prefixes) ----------
// Get a single arm by its ID (used in OpenArm page)
router.get('/:id', authMiddleware, armController.getById);

// Create a new arm (admin only)
router.post('/', authMiddleware, privilegeGuard('classes'), armController.create);

// Update an existing arm (admin only)
router.patch('/:id', authMiddleware, privilegeGuard('classes'), armController.update);

// Delete an arm (admin only)
router.delete('/:id', authMiddleware, privilegeGuard('classes'), armController.delete);

export default router;