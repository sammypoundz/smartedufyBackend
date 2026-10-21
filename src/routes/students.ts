import { Router } from 'express';
import { studentController } from '../controllers/studentController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard, privilegeGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Public / special routes (no auth or student-specific) ----------
router.get('/validate', studentController.validateByAdmission); // public

// Authenticated student "me" endpoint
router.get('/me', authMiddleware, studentController.getMe); // student uses their own token

// ---------- Static / specific prefix routes ----------
router.get('/arm/:armId', authMiddleware, studentController.getByArm);
router.get('/class/:classId', authMiddleware, studentController.getByClass);
router.get('/parents', authMiddleware, studentController.getAllParents);
router.post('/parents', authMiddleware, privilegeGuard('students', 'parents'), studentController.createParent);

// ---------- Routes with student ID + subpath ----------
router.get('/:id/subjects', authMiddleware, studentController.getStudentSubjects);
router.put('/:id/subjects', authMiddleware, privilegeGuard('students'), studentController.updateStudentSubjects);
router.get('/:id/attendance', authMiddleware, studentController.getStudentAttendance);
router.get('/:id/fees', authMiddleware, studentController.getStudentFees);
router.get('/:id/results', authMiddleware, studentController.getStudentResults);
router.get('/:id/history', authMiddleware, studentController.getStudentHistory);
router.get('/:id/transcript', authMiddleware, studentController.getStudentTranscript);
router.post('/:id/assign-parent', authMiddleware, privilegeGuard('students'), studentController.assignParent);
// ✅ NEW: Unassign parent
router.patch('/:id/unassign-parent', authMiddleware, privilegeGuard('students'), studentController.unassignParent);

router.post('/bulk-delete', authMiddleware, privilegeGuard('students'), studentController.bulkDelete);

// ---------- Generic student CRUD (must come after more specific routes) ----------
router.get('/', authMiddleware, studentController.getAll);
router.get('/:id', authMiddleware, studentController.getById);
router.post('/', authMiddleware, privilegeGuard('students'), studentController.create);
router.patch('/:id', authMiddleware, privilegeGuard('students'), studentController.update);
router.delete('/:id', authMiddleware, privilegeGuard('students'), studentController.delete);

export default router;