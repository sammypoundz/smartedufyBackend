import { Router } from 'express';
import { resultController } from '../controllers/resultController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ---------- Specific routes (must come before generic ones) ----------
/**
 * GET /api/results/history?armId=...
 * Returns distinct (academicYearId, term) combinations for a given arm.
 */
router.get('/history', authMiddleware, resultController.getHistory);

// ---------- Generic query routes ----------
/**
 * GET /api/results?armId=&subjectId=&term=&academicYearId=
 * Get results by query parameters – used by result compiler & reports.
 */
router.get('/', authMiddleware, resultController.getByFilters);

// Bulk upsert results (create or update many)
router.post('/bulk', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), resultController.bulkUpsert);

// ---------- NEW: Push test attempts to results ----------
/**
 * POST /api/results/from-test-attempts
 * Takes test attempt scores and creates Result records (CA or Exam).
 * Body: { testId, academicYearId, term, resultType }
 */
router.post('/from-test-attempts', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), resultController.pushTestAttemptsToResults);
console.log('✅ POST /from-test-attempts registered');

// ---------- Routes with path parameters ----------
// Get results for a specific student (optionally filtered by academicYearId via query)
router.get('/student/:studentId', authMiddleware, resultController.getByStudent);

// Get results for an arm (all students in that arm, optionally by term and academicYearId)
router.get('/arm/:armId', authMiddleware, resultController.getByArm);

// Get results for a subject (across all arms, optionally by term and academicYearId)
router.get('/subject/:subjectId', authMiddleware, resultController.getBySubject);

// (Optional) Get results for an academic year (all records)
router.get('/academic-year/:academicYearId', authMiddleware, resultController.getByAcademicYear);

// Create a new result (single)
router.post('/', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), resultController.create);

// Update an existing result
router.put('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), resultController.update);

// Delete a result
router.delete('/:id', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), resultController.delete);

export default router;