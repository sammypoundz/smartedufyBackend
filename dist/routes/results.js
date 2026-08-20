"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const resultController_1 = require("../controllers/resultController");
const auth_1 = require("../middleware/auth");
const roleGuard_1 = require("../middleware/roleGuard");
const router = (0, express_1.Router)();
// ---------- Specific routes (must come before generic ones) ----------
/**
 * GET /api/results/history?armId=...
 * Returns distinct (academicYearId, term) combinations for a given arm.
 */
router.get('/history', auth_1.authMiddleware, resultController_1.resultController.getHistory);
// ---------- Generic query routes ----------
/**
 * GET /api/results?armId=&subjectId=&term=&academicYearId=
 * Get results by query parameters – used by result compiler & reports.
 */
router.get('/', auth_1.authMiddleware, resultController_1.resultController.getByFilters);
// Bulk upsert results (create or update many)
router.post('/bulk', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), resultController_1.resultController.bulkUpsert);
// ---------- NEW: Push test attempts to results ----------
/**
 * POST /api/results/from-test-attempts
 * Takes test attempt scores and creates Result records (CA or Exam).
 * Body: { testId, academicYearId, term, resultType }
 */
router.post('/from-test-attempts', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), resultController_1.resultController.pushTestAttemptsToResults);
console.log('✅ POST /from-test-attempts registered');
// ---------- Routes with path parameters ----------
// Get results for a specific student (optionally filtered by academicYearId via query)
router.get('/student/:studentId', auth_1.authMiddleware, resultController_1.resultController.getByStudent);
// Get results for an arm (all students in that arm, optionally by term and academicYearId)
router.get('/arm/:armId', auth_1.authMiddleware, resultController_1.resultController.getByArm);
// Get results for a subject (across all arms, optionally by term and academicYearId)
router.get('/subject/:subjectId', auth_1.authMiddleware, resultController_1.resultController.getBySubject);
// (Optional) Get results for an academic year (all records)
router.get('/academic-year/:academicYearId', auth_1.authMiddleware, resultController_1.resultController.getByAcademicYear);
// Create a new result (single)
router.post('/', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), resultController_1.resultController.create);
// Update an existing result
router.put('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), resultController_1.resultController.update);
// Delete a result
router.delete('/:id', auth_1.authMiddleware, (0, roleGuard_1.roleGuard)(['ADMIN', 'TEACHER']), resultController_1.resultController.delete);
exports.default = router;
