import { Router } from 'express';
import { attendanceController } from '../controllers/attendanceController';
import { authMiddleware } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

/**
 * GET /api/attendance/student/:studentId
 * Returns all attendance records for a specific student:
 * [{ date: string, present: boolean }]
 */
router.get('/student/:studentId', authMiddleware, attendanceController.getByStudentId);

/**
 * GET /api/attendance/arm/:armId
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 * Returns flat list of attendance records:
 * [{ studentId: string, date: string, present: boolean }]
 */
router.get('/arm/:armId', authMiddleware, attendanceController.getByArm);

/**
 * POST /api/attendance/arm/:armId
 * Body: { date: string, records: [{ studentId: string, present: boolean }] }
 * Saves/updates attendance for the given date.
 */
router.post('/arm/:armId', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), attendanceController.saveAttendance);

/**
 * Legacy endpoint – kept for backward compatibility
 * POST /api/attendance/mark
 * Body: { date: string, records: [{ studentId: string, present: boolean }] }
 */
router.post('/mark', authMiddleware, roleGuard(['ADMIN', 'TEACHER']), attendanceController.mark);

export default router;