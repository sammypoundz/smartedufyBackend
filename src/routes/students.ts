import { Router } from 'express';
import { studentController } from '../controllers/studentController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Public / special routes (no auth or student-specific) ----------
router.get('/validate', studentController.validateByAdmission); // public

// Authenticated student "me" endpoint
router.get('/me', authMiddleware, studentController.getMe); // student uses their own token

// ---------- Static / specific prefix routes ----------
router.get('/arm/:armId', authMiddleware, studentController.getByArm);
router.get('/class/:classId', authMiddleware, studentController.getByClass);
router.get('/parents', authMiddleware, studentController.getAllParents);
router.post('/parents', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), studentController.createParent);

// ---------- Routes with student ID + subpath ----------
router.get('/:id/subjects', authMiddleware, studentController.getStudentSubjects);
router.put('/:id/subjects', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), studentController.updateStudentSubjects);
router.get('/:id/attendance', authMiddleware, studentController.getStudentAttendance);
router.get('/:id/fees', authMiddleware, studentController.getStudentFees);
router.get('/:id/results', authMiddleware, studentController.getStudentResults);
router.post('/:id/assign-parent', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), studentController.assignParent);
// ✅ NEW: Unassign parent
router.patch('/:id/unassign-parent', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), studentController.unassignParent);

// ---------- Generic student CRUD (must come after more specific routes) ----------
router.get('/', authMiddleware, studentController.getAll);
router.get('/:id', authMiddleware, studentController.getById);
router.post('/', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), studentController.create);
router.patch('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), studentController.update);
router.delete('/:id', authMiddleware, roleGuard(['ADMIN']), studentController.delete);

export default router;